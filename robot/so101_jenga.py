"""
SO-101 Jenga Controller -- Waypoint-based push controller for Jenga.

Uses pre-calibrated joint angle waypoints and linear interpolation
between rows. No inverse kinematics -- manually taught positions.

Calibration:
  1. Run with --calibrate to record waypoints interactively
  2. Waypoints are saved to robot/waypoints.json
  3. During play, row heights are interpolated from reference waypoints

Motor interface:
  Uses Feetech SCS protocol (via scservo_sdk or raw serial fallback) for
  STS3215 servos on the SO-101 arm.
  Position range: 0-4095 ticks (0-360 degrees, center at 2048 = 180 deg).
  Waypoints are stored in degrees and converted to ticks for commands.
"""

import json
import time
from pathlib import Path

try:
    import serial as _pyserial
    _SERIAL_AVAILABLE = True
except ImportError:
    _pyserial = None
    _SERIAL_AVAILABLE = False

# --- Feetech STS3215 / SCS Protocol Constants ---
BAUDRATE = 1_000_000

# STS3215 control table addresses (SRAM, R/W)
ADDR_MODE = 33              # 1 byte, EPROM -- operating mode
ADDR_TORQUE_ENABLE = 40     # 1 byte -- torque on/off
ADDR_ACC = 41               # 1 byte -- acceleration (0-254)
ADDR_GOAL_POSITION = 42     # 2 bytes -- target position (0-4095)
ADDR_GOAL_TIME = 44         # 2 bytes -- move time (ms)
ADDR_GOAL_SPEED = 46        # 2 bytes -- move speed (steps/s)
ADDR_LOCK = 55              # 1 byte -- EPROM lock

# STS3215 control table addresses (SRAM, R/O)
ADDR_PRESENT_POSITION = 56  # 2 bytes -- current position (0-4095)
ADDR_PRESENT_SPEED = 58     # 2 bytes -- current speed
ADDR_PRESENT_LOAD = 60      # 2 bytes -- current load
ADDR_PRESENT_VOLTAGE = 62   # 1 byte  -- voltage (0.1V units)
ADDR_PRESENT_TEMP = 63      # 1 byte  -- temperature (C)
ADDR_MOVING = 66            # 1 byte  -- 1 if moving

# STS3215 position range
TICKS_PER_REV = 4095
CENTER_TICK = 2048  # 180 degrees

# Operating modes (address 33)
MODE_POSITION = 0   # Angle servo (default, 0-360 deg absolute)
MODE_SPEED_CL = 1   # Speed closed-loop motor
MODE_SPEED_OL = 2   # Speed open-loop motor
MODE_STEP = 3       # Step mode (relative to current position)

# Speed presets (STS3215 units: steps/second, max ~3073)
SPEED_SLOW = 400
SPEED_NORMAL = 800
DEFAULT_SPEED = SPEED_SLOW
DEFAULT_ACC = 50  # acceleration ramp (0-254)

# --- Configurable Jenga Constants ---
# Standard Jenga block: 7.5cm x 2.5cm x 1.5cm
BLOCK_HEIGHT_CM = 1.5
BLOCK_WIDTH_CM = 2.5
BLOCK_LENGTH_CM = 7.5

# Push distances (cm past block center) mapped to force levels
PUSH_DISTANCE = {
    "gentle": 2.0,
    "medium": 4.0,
    "firm": 6.0,
}

# Speed multipliers (fraction of max speed)
SPEED_MULT = {
    "slow": 0.3,
    "normal": 0.6,
}

# Playable row range (SO-101 arm reach constraint)
MIN_ROW = 3
MAX_ROW = 12

# Joint names and their servo IDs for SO-101
JOINT_NAMES = [
    "shoulder_pan",
    "shoulder_lift",
    "elbow_flex",
    "wrist_flex",
    "wrist_roll",
    "gripper",
]

MOTOR_IDS = {
    "shoulder_pan": 1,
    "shoulder_lift": 2,
    "elbow_flex": 3,
    "wrist_flex": 4,
    "wrist_roll": 5,
    "gripper": 6,
}

WAYPOINTS_FILE = Path(__file__).parent / "waypoints.json"

# Inter-command delay (seconds).  The CH340 USB-serial adapter used by
# common Feetech controller boards needs a short gap between successive
# SCS transactions to avoid corrupted responses.
_CMD_DELAY = 0.006


# --- SCS Protocol Low-Level (raw serial) ---

class SCSProtocol:
    """Minimal Feetech SCS half-duplex serial protocol implementation.

    The scservo_sdk PortHandler uses ``timeout=0`` (non-blocking reads)
    with an internal polling loop, which interacts badly with CH340-class
    USB-serial adapters whose USB microframe batching delays incoming
    bytes.  This class uses a small blocking timeout instead, which is
    far more reliable on the SO-101's CH340 board.
    """

    def __init__(self, port_name: str, baudrate: int = 1_000_000,
                 timeout: float = 0.05):
        self.ser: _pyserial.Serial | None = None
        self.port_name = port_name
        self.baudrate = baudrate
        self.timeout = timeout

    # -- lifecycle --------------------------------------------------------

    def open(self) -> bool:
        try:
            self.ser = _pyserial.Serial(
                port=self.port_name,
                baudrate=self.baudrate,
                bytesize=_pyserial.EIGHTBITS,
                parity=_pyserial.PARITY_NONE,
                stopbits=_pyserial.STOPBITS_ONE,
                timeout=self.timeout,
            )
            time.sleep(0.3)  # let CH340 settle after open
            self.ser.reset_input_buffer()
            return True
        except Exception as exc:
            print(f"[SCS] Failed to open {self.port_name}: {exc}")
            self.ser = None
            return False

    def close(self):
        if self.ser and self.ser.is_open:
            self.ser.close()
        self.ser = None

    # -- packet helpers ---------------------------------------------------

    @staticmethod
    def _checksum(data: bytes) -> int:
        """SCS checksum: ~(sum of bytes from ID onward) & 0xFF."""
        return (~sum(data) & 0xFF)

    def _transact(self, servo_id: int, instruction: int,
                  params: bytes = b"") -> bytes | None:
        """Send an SCS packet and return the response payload (after
        header+ID+length+error), or *None* on failure.

        Returns the full response packet (including 0xFF 0xFF header) on
        success, or None.
        """
        if self.ser is None:
            return None

        length = len(params) + 2  # instruction + params + checksum
        pkt = bytes([0xFF, 0xFF, servo_id, length, instruction]) + params
        pkt += bytes([self._checksum(pkt[2:])])

        self.ser.reset_input_buffer()
        self.ser.write(pkt)
        self.ser.flush()

        # Expected response length: header(2) + ID(1) + length(1) +
        # error(1) + data(...) + checksum(1).  For a ping the response
        # has 0 data bytes (total 6).  For reads, data bytes = read len.
        # We don't know the exact length yet so read until we get a
        # complete packet or time out.
        time.sleep(_CMD_DELAY)
        rx = self.ser.read(128)
        if len(rx) < 6:
            return None

        # Find the 0xFF 0xFF header in the response
        idx = 0
        while idx < len(rx) - 1:
            if rx[idx] == 0xFF and rx[idx + 1] == 0xFF:
                break
            idx += 1
        else:
            return None

        resp = rx[idx:]
        if len(resp) < 6:
            return None

        # Validate response ID matches
        if resp[2] != servo_id:
            return None

        resp_len = resp[3]
        total = resp_len + 4  # header(2) + ID(1) + length(1) + payload
        if len(resp) < total:
            return None

        # Validate checksum
        expected_chk = self._checksum(resp[2 : total - 1])
        if resp[total - 1] != expected_chk:
            return None

        return resp[:total]

    # -- public protocol operations ---------------------------------------

    def ping(self, servo_id: int) -> tuple[bool, int]:
        """Ping a servo.  Returns (success, error_byte)."""
        resp = self._transact(servo_id, 0x01)
        if resp is None:
            return False, -1
        return True, resp[4]

    def read1(self, servo_id: int, address: int) -> int | None:
        """Read 1 byte from the control table."""
        resp = self._transact(servo_id, 0x02,
                              bytes([address, 1]))
        if resp is None or len(resp) < 7:
            return None
        return resp[5]

    def read2(self, servo_id: int, address: int) -> int | None:
        """Read 2 bytes (little-endian word) from the control table."""
        resp = self._transact(servo_id, 0x02,
                              bytes([address, 2]))
        if resp is None or len(resp) < 8:
            return None
        return resp[5] | (resp[6] << 8)

    def write1(self, servo_id: int, address: int, value: int) -> bool:
        """Write 1 byte to the control table."""
        resp = self._transact(servo_id, 0x03,
                              bytes([address, value & 0xFF]))
        return resp is not None

    def write2(self, servo_id: int, address: int, value: int) -> bool:
        """Write 2 bytes (little-endian word) to the control table."""
        lo = value & 0xFF
        hi = (value >> 8) & 0xFF
        resp = self._transact(servo_id, 0x03,
                              bytes([address, lo, hi]))
        return resp is not None


# --- Conversion Helpers ---

def degrees_to_ticks(degrees: float) -> int:
    """Convert degrees (0-360) to STS3215 ticks (0-4095)."""
    return int((degrees / 360.0) * TICKS_PER_REV)


def ticks_to_degrees(ticks: int) -> float:
    """Convert STS3215 ticks (0-4095) to degrees (0-360)."""
    return (ticks / TICKS_PER_REV) * 360.0


class SO101JengaController:
    """Waypoint-based SO-101 controller for Jenga block pushing."""

    def __init__(self, port: str = "/dev/ttyACM0", baudrate: int = BAUDRATE):
        self.port = port
        self.baudrate = baudrate
        self._scs: SCSProtocol | None = None
        self.waypoints = self._load_waypoints()
        self.connected = False

    # --- Waypoint persistence ---

    def _load_waypoints(self) -> dict:
        """Load calibrated waypoints from JSON file."""
        if WAYPOINTS_FILE.exists():
            return json.loads(WAYPOINTS_FILE.read_text())
        # Default waypoints in degrees (must be calibrated for your setup).
        # Convention: 180 deg = centre of STS3215 range (tick 2048).
        return {
            "home": [180, 135, 270, 180, 180, 180],
            "approach_left_low": [210, 160, 240, 170, 180, 180],
            "approach_left_high": [210, 140, 260, 170, 180, 180],
            "approach_right_low": [150, 160, 240, 170, 180, 180],
            "approach_right_high": [150, 140, 260, 170, 180, 180],
            "reference_rows": {
                "low_row": 4,
                "low_height_offset": 0,
                "high_row": 10,
                "high_height_offset": 1.0,
            },
        }

    def _save_waypoints(self):
        """Save current waypoints to JSON."""
        WAYPOINTS_FILE.write_text(json.dumps(self.waypoints, indent=2))

    # --- Low-level motor helpers ---

    def _enable_torque(self, motor_id: int):
        if self._scs:
            self._scs.write1(motor_id, ADDR_TORQUE_ENABLE, 1)

    def _disable_torque(self, motor_id: int):
        if self._scs:
            self._scs.write1(motor_id, ADDR_TORQUE_ENABLE, 0)

    def _set_mode(self, motor_id: int, mode: int):
        """Set operating mode. Torque must be disabled first."""
        if not self._scs:
            return
        self._disable_torque(motor_id)
        # Mode is in EPROM -- unlock, write, re-lock
        self._scs.write1(motor_id, ADDR_LOCK, 0)
        self._scs.write1(motor_id, ADDR_MODE, mode)
        self._scs.write1(motor_id, ADDR_LOCK, 1)
        self._enable_torque(motor_id)

    def _set_acceleration(self, motor_id: int, acc: int):
        if self._scs:
            self._scs.write1(motor_id, ADDR_ACC, min(254, max(0, acc)))

    def _set_goal_speed(self, motor_id: int, speed: int):
        """Set the movement speed (steps/second, 0-3073)."""
        if self._scs:
            self._scs.write2(motor_id, ADDR_GOAL_SPEED,
                             min(3073, max(0, speed)))

    def _set_goal_position(self, motor_id: int, ticks: int):
        ticks = max(0, min(TICKS_PER_REV, ticks))
        if self._scs:
            self._scs.write2(motor_id, ADDR_GOAL_POSITION, ticks)

    def _read_position(self, motor_id: int) -> int:
        if not self._scs:
            return CENTER_TICK
        pos = self._scs.read2(motor_id, ADDR_PRESENT_POSITION)
        return pos if pos is not None else CENTER_TICK

    def _read_all_positions_deg(self) -> list[float]:
        """Read current positions of all motors, returned in degrees."""
        return [
            ticks_to_degrees(self._read_position(MOTOR_IDS[name]))
            for name in JOINT_NAMES
        ]

    # --- Connection lifecycle ---

    def connect(self):
        """Initialize connection to SO-101 arm."""
        if not _SERIAL_AVAILABLE:
            print("[SO-101] WARNING: pyserial not installed. Install with:")
            print("  pip install pyserial")
            print("[SO-101] Running in dry-run mode (no actual motor commands)")
            self.connected = False
            return

        try:
            self._scs = SCSProtocol(self.port, self.baudrate)

            if not self._scs.open():
                raise RuntimeError(f"Failed to open port {self.port}")

            # Scan for connected servos
            print(f"[SO-101] Scanning for servos on {self.port} "
                  f"@ {self.baudrate} baud (SCS protocol)...")
            found_ids = []
            for mid in range(1, 21):
                ok, err = self._scs.ping(mid)
                if ok:
                    found_ids.append(mid)
                    model = self._scs.read2(mid, 3)  # model number reg
                    print(f"  Found servo ID {mid} "
                          f"(model={model}, error={err})")

            if not found_ids:
                print("[SO-101] WARNING: No servos responded to ping.")
                print("[SO-101] Check power supply and wiring.")
                print("[SO-101] Continuing -- motors will be commanded "
                      "but may not move.")

            # Configure each motor: position mode, acceleration, speed
            for name in JOINT_NAMES:
                mid = MOTOR_IDS[name]
                self._set_mode(mid, MODE_POSITION)
                self._set_acceleration(mid, DEFAULT_ACC)
                self._set_goal_speed(mid, DEFAULT_SPEED)

            self.connected = True
            print(f"[SO-101] Connected on {self.port} "
                  f"@ {self.baudrate} baud")

        except Exception as e:
            print(f"[SO-101] Connection failed: {e}")
            print("[SO-101] Running in dry-run mode")
            self.connected = False
            if self._scs:
                self._scs.close()
                self._scs = None

    def disconnect(self):
        """Disconnect from SO-101."""
        if self.connected and self._scs is not None:
            # Disable torque on all motors before closing
            for name in JOINT_NAMES:
                try:
                    self._disable_torque(MOTOR_IDS[name])
                except Exception:
                    pass
            self._scs.close()
            print("[SO-101] Disconnected")
        self.connected = False
        self._scs = None

    # --- Movement primitives ---

    def _move_to_joints(self, joint_angles_deg: list[float],
                        speed_mult: float = 0.5):
        """
        Move arm to specified joint angles (in degrees) with speed control.

        ``speed_mult`` scales the goal speed: higher = faster.
        """
        if not self.connected or self._scs is None:
            print(f"[SO-101 dry-run] Move to: {joint_angles_deg}")
            return

        # Map speed_mult (0-1) to goal speed.
        # Interpolate between SLOW and NORMAL presets.
        speed = int(
            SPEED_SLOW
            + (SPEED_NORMAL - SPEED_SLOW) * min(speed_mult, 1.0)
        )
        if speed <= 0:
            speed = 1

        for name, angle_deg in zip(JOINT_NAMES, joint_angles_deg):
            mid = MOTOR_IDS[name]
            self._set_goal_speed(mid, speed)
            self._set_goal_position(mid, degrees_to_ticks(angle_deg))

        # Wait for movement to complete (simple time-based estimate).
        # Slower speed_mult -> longer travel time.
        travel_time = 1.0 / max(speed_mult, 0.1)
        time.sleep(min(travel_time, 3.0))

    def _interpolate_waypoints(self, wp_low: list, wp_high: list,
                               t: float) -> list:
        """Linear interpolation between two waypoint sets."""
        return [low + (high - low) * t for low, high in zip(wp_low, wp_high)]

    def _row_to_interpolation_t(self, row: int) -> float:
        """Convert row number to interpolation parameter
        (0.0 = low, 1.0 = high)."""
        ref = self.waypoints.get("reference_rows", {})
        low_row = ref.get("low_row", 4)
        high_row = ref.get("high_row", 10)
        if high_row == low_row:
            return 0.5
        t = (row - low_row) / (high_row - low_row)
        return max(0.0, min(1.0, t))

    # --- Public interface ---

    def home(self):
        """Move to safe home position above the tower."""
        print("[SO-101] Moving to home position")
        self._move_to_joints(self.waypoints["home"], speed_mult=0.5)

    def push_block(
        self,
        target_row: int,
        target_position: str,
        push_direction: str,
        push_force: str = "gentle",
        approach_speed: str = "slow",
    ):
        """
        Execute a push on a specific Jenga block.

        Args:
            target_row: Row number (1=bottom, 18=top)
            target_position: "left", "middle", or "right"
            push_direction: "left_to_right" or "right_to_left"
            push_force: "gentle", "medium", or "firm"
            approach_speed: "slow" or "normal"
        """
        # Clamp row to reachable range
        row = max(MIN_ROW, min(MAX_ROW, target_row))
        if row != target_row:
            print(f"[SO-101] Row {target_row} out of reach, "
                  f"clamping to {row}")

        speed = SPEED_MULT.get(approach_speed, 0.3)
        t = self._row_to_interpolation_t(row)

        # Select approach waypoints based on push direction
        if push_direction == "left_to_right":
            wp_low = self.waypoints.get("approach_left_low",
                                        self.waypoints["home"])
            wp_high = self.waypoints.get("approach_left_high",
                                         self.waypoints["home"])
        else:
            wp_low = self.waypoints.get("approach_right_low",
                                        self.waypoints["home"])
            wp_high = self.waypoints.get("approach_right_high",
                                         self.waypoints["home"])

        approach_pos = self._interpolate_waypoints(wp_low, wp_high, t)

        # Adjust for target_position (offset shoulder_pan slightly)
        position_offset = {"left": -5, "middle": 0, "right": 5}
        pan_adjust = position_offset.get(target_position, 0)
        approach_pos[0] += pan_adjust

        print(
            f"[SO-101] PUSH: row {row}, {target_position}, "
            f"{push_direction}, force={push_force}, speed={approach_speed}"
        )

        # Step 1: Move to approach position
        print("[SO-101] Step 1: Approaching target")
        self._move_to_joints(approach_pos, speed_mult=speed)

        # Step 2: Push forward
        print("[SO-101] Step 2: Pushing")
        push_pos = approach_pos.copy()
        # Adjust the elbow_flex joint (index 2) for push distance
        push_dist = PUSH_DISTANCE.get(push_force, 2.0)
        push_pos[2] += push_dist * 3  # Scale factor (degrees)
        self._move_to_joints(push_pos, speed_mult=speed * 0.7)

        # Step 3: Retract
        print("[SO-101] Step 3: Retracting")
        self._move_to_joints(approach_pos, speed_mult=speed)

        # Step 4: Return home
        self.home()

    def execute_move(self, move: dict):
        """Adapter for the main loop's move dict."""
        self.push_block(
            target_row=move.get("target_row", 5),
            target_position=move.get("target_position", "middle"),
            push_direction=move.get("push_direction", "left_to_right"),
            push_force=move.get("push_force", "gentle"),
            approach_speed=move.get("approach_speed", "slow"),
        )

    def calibrate_interactive(self):
        """
        Interactive calibration mode to record waypoints.

        Torque is disabled so the arm can be moved by hand. At each
        position the user presses Enter and the current joint angles
        are recorded (in degrees).
        """
        print("\n=== SO-101 Jenga Calibration ===")
        print("Move the arm to each position and press Enter to record.\n")

        positions_to_record = [
            ("home", "Home position (safe, above tower)"),
            ("approach_left_low", "Left approach, low row (row ~4)"),
            ("approach_left_high", "Left approach, high row (row ~10)"),
            ("approach_right_low", "Right approach, low row (row ~4)"),
            ("approach_right_high", "Right approach, high row (row ~10)"),
        ]

        if not self.connected or self._scs is None:
            print("Cannot calibrate without motor connection.")
            return

        # Disable torque so the user can freely position the arm
        for name in JOINT_NAMES:
            self._disable_torque(MOTOR_IDS[name])
        print("Torque disabled -- you can now move the arm by hand.\n")

        for name, description in positions_to_record:
            input(f"\nMove arm to: {description}\nPress Enter when ready...")
            angles_deg = self._read_all_positions_deg()
            # Round to 1 decimal for readability
            angles_deg = [round(a, 1) for a in angles_deg]
            self.waypoints[name] = angles_deg
            print(f"  Recorded {name}: {angles_deg}")

        # Re-enable torque after calibration
        for name in JOINT_NAMES:
            self._enable_torque(MOTOR_IDS[name])

        self._save_waypoints()
        print(f"\nWaypoints saved to {WAYPOINTS_FILE}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="SO-101 Jenga block push controller"
    )
    parser.add_argument(
        "--calibrate", action="store_true",
        help="Run interactive calibration"
    )
    parser.add_argument("--port", default="/dev/ttyACM0")
    parser.add_argument(
        "--test", action="store_true",
        help="Test push at row 5 middle"
    )
    parser.add_argument(
        "--scan", action="store_true",
        help="Scan for servos and print status (no movement)"
    )
    args = parser.parse_args()

    ctrl = SO101JengaController(port=args.port)
    ctrl.connect()

    if args.scan:
        # Just scan -- connect() already printed what it found
        if ctrl.connected and ctrl._scs is not None:
            print("\n--- Servo Status ---")
            for name in JOINT_NAMES:
                mid = MOTOR_IDS[name]
                ok, _ = ctrl._scs.ping(mid)
                if ok:
                    pos = ctrl._scs.read2(mid, ADDR_PRESENT_POSITION)
                    volt = ctrl._scs.read1(mid, ADDR_PRESENT_VOLTAGE)
                    temp = ctrl._scs.read1(mid, ADDR_PRESENT_TEMP)
                    mode = ctrl._scs.read1(mid, ADDR_MODE)
                    deg = ticks_to_degrees(pos) if pos is not None else "?"
                    v = f"{volt / 10.0}V" if volt is not None else "?"
                    t = f"{temp}C" if temp is not None else "?"
                    m = mode if mode is not None else "?"
                    print(f"  {name} (ID {mid}): pos={deg}"
                          f" volt={v} temp={t} mode={m}")
                else:
                    print(f"  {name} (ID {mid}): NOT RESPONDING")
    elif args.calibrate:
        ctrl.calibrate_interactive()
    elif args.test:
        ctrl.home()
        ctrl.push_block(5, "middle", "left_to_right", "gentle", "slow")
    else:
        print("Use --calibrate, --test, or --scan")

    ctrl.disconnect()
