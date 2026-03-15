"""
SO-101 Jenga Controller -- Waypoint-based push controller for Jenga.

Uses pre-calibrated joint angle waypoints and linear interpolation
between rows. No inverse kinematics -- manually taught positions.

Calibration:
  1. Run with --calibrate to record waypoints interactively
  2. Waypoints are saved to robot/waypoints.json
  3. During play, row heights are interpolated from reference waypoints

Motor interface:
  Uses dynamixel_sdk directly with Protocol 2.0 for XL330 motors.
  Position range: 0-4095 ticks (0-360 degrees, center at 2048 = 180 deg).
  Waypoints are stored in degrees and converted to ticks for commands.
"""

import json
import time
from pathlib import Path

try:
    from dynamixel_sdk import PacketHandler, PortHandler
    _SDK_AVAILABLE = True
except ImportError:
    _SDK_AVAILABLE = False

# --- Dynamixel Protocol 2.0 / XL330 Constants ---
PROTOCOL_VERSION = 2.0
BAUDRATE = 1_000_000

# XL330 control table addresses
ADDR_OPERATING_MODE = 11
ADDR_TORQUE_ENABLE = 64
ADDR_PROFILE_VELOCITY = 112
ADDR_GOAL_POSITION = 116
ADDR_PRESENT_POSITION = 132

# XL330 position range
TICKS_PER_REV = 4095
CENTER_TICK = 2048  # 180 degrees

# Operating modes
OPERATING_MODE_POSITION = 3  # Position control (default)

# Profile velocity presets (XL330 units, approx 0.229 rev/min per tick)
PROFILE_VELOCITY_SLOW = 100
PROFILE_VELOCITY_NORMAL = 200
DEFAULT_PROFILE_VELOCITY = PROFILE_VELOCITY_SLOW

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

# Joint names and their Dynamixel motor IDs for SO-101
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


# --- Conversion Helpers ---

def degrees_to_ticks(degrees: float) -> int:
    """Convert degrees (0-360) to XL330 ticks (0-4095)."""
    return int((degrees / 360.0) * TICKS_PER_REV)


def ticks_to_degrees(ticks: int) -> float:
    """Convert XL330 ticks (0-4095) to degrees (0-360)."""
    return (ticks / TICKS_PER_REV) * 360.0


class SO101JengaController:
    """Waypoint-based SO-101 controller for Jenga block pushing."""

    def __init__(self, port: str = "/dev/ttyACM0", baudrate: int = BAUDRATE):
        self.port = port
        self.baudrate = baudrate
        self.port_handler = None
        self.packet_handler = None
        self.waypoints = self._load_waypoints()
        self.connected = False

    # --- Waypoint persistence ---

    def _load_waypoints(self) -> dict:
        """Load calibrated waypoints from JSON file."""
        if WAYPOINTS_FILE.exists():
            return json.loads(WAYPOINTS_FILE.read_text())
        # Default waypoints in degrees (must be calibrated for your setup).
        # Convention: 180 deg = centre of XL330 range (tick 2048).
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
        self.packet_handler.write1ByteTxRx(
            self.port_handler, motor_id, ADDR_TORQUE_ENABLE, 1
        )

    def _disable_torque(self, motor_id: int):
        self.packet_handler.write1ByteTxRx(
            self.port_handler, motor_id, ADDR_TORQUE_ENABLE, 0
        )

    def _set_operating_mode(self, motor_id: int, mode: int):
        """Set operating mode. Torque must be disabled first."""
        self._disable_torque(motor_id)
        self.packet_handler.write1ByteTxRx(
            self.port_handler, motor_id, ADDR_OPERATING_MODE, mode
        )
        self._enable_torque(motor_id)

    def _set_profile_velocity(self, motor_id: int, velocity: int):
        self.packet_handler.write4ByteTxRx(
            self.port_handler, motor_id, ADDR_PROFILE_VELOCITY, velocity
        )

    def _set_goal_position(self, motor_id: int, ticks: int):
        ticks = max(0, min(TICKS_PER_REV, ticks))
        self.packet_handler.write4ByteTxRx(
            self.port_handler, motor_id, ADDR_GOAL_POSITION, ticks
        )

    def _read_position(self, motor_id: int) -> int:
        position, _, _ = self.packet_handler.read4ByteTxRx(
            self.port_handler, motor_id, ADDR_PRESENT_POSITION
        )
        return position

    def _read_all_positions_deg(self) -> list[float]:
        """Read current positions of all motors, returned in degrees."""
        return [
            ticks_to_degrees(self._read_position(MOTOR_IDS[name]))
            for name in JOINT_NAMES
        ]

    # --- Connection lifecycle ---

    def connect(self):
        """Initialize connection to SO-101 arm."""
        if not _SDK_AVAILABLE:
            print("[SO-101] WARNING: dynamixel_sdk not installed. Install with:")
            print("  pip install dynamixel-sdk")
            print("[SO-101] Running in dry-run mode (no actual motor commands)")
            self.connected = False
            return

        try:
            self.port_handler = PortHandler(self.port)
            self.packet_handler = PacketHandler(PROTOCOL_VERSION)

            if not self.port_handler.openPort():
                raise RuntimeError(f"Failed to open port {self.port}")

            if not self.port_handler.setBaudRate(self.baudrate):
                raise RuntimeError(
                    f"Failed to set baud rate {self.baudrate} on {self.port}"
                )

            # Scan for connected servos
            print(f"[SO-101] Scanning for servos on {self.port} @ {self.baudrate} baud...")
            found_ids = []
            for mid in range(20):
                model_number, comm_result, _ = self.packet_handler.ping(
                    self.port_handler, mid
                )
                if comm_result == 0:  # COMM_SUCCESS
                    found_ids.append(mid)
                    print(f"  Found servo ID {mid} (model={model_number})")

            if not found_ids:
                print("[SO-101] WARNING: No servos responded to ping.")
                print("[SO-101] Check power supply and wiring.")
                print("[SO-101] Continuing -- motors will be commanded but may not move.")

            # Configure each motor: position mode, torque on, default velocity
            for name in JOINT_NAMES:
                mid = MOTOR_IDS[name]
                self._set_operating_mode(mid, OPERATING_MODE_POSITION)
                self._set_profile_velocity(mid, DEFAULT_PROFILE_VELOCITY)

            self.connected = True
            print(f"[SO-101] Connected on {self.port} @ {self.baudrate} baud")

        except Exception as e:
            print(f"[SO-101] Connection failed: {e}")
            print("[SO-101] Running in dry-run mode")
            self.connected = False

    def disconnect(self):
        """Disconnect from SO-101."""
        if self.connected and self.port_handler is not None:
            # Disable torque on all motors before closing
            for name in JOINT_NAMES:
                try:
                    self._disable_torque(MOTOR_IDS[name])
                except Exception:
                    pass
            self.port_handler.closePort()
            print("[SO-101] Disconnected")
        self.connected = False
        self.port_handler = None
        self.packet_handler = None

    # --- Movement primitives ---

    def _move_to_joints(self, joint_angles_deg: list[float], speed_mult: float = 0.5):
        """
        Move arm to specified joint angles (in degrees) with speed control.

        ``speed_mult`` scales the profile velocity: higher = faster.
        """
        if not self.connected or self.port_handler is None:
            print(f"[SO-101 dry-run] Move to: {joint_angles_deg}")
            return

        # Map speed_mult (0-1) to profile velocity.
        # Interpolate between SLOW and NORMAL presets.
        velocity = int(
            PROFILE_VELOCITY_SLOW
            + (PROFILE_VELOCITY_NORMAL - PROFILE_VELOCITY_SLOW) * min(speed_mult, 1.0)
        )
        if velocity <= 0:
            velocity = 1  # minimum non-zero

        for name, angle_deg in zip(JOINT_NAMES, joint_angles_deg):
            mid = MOTOR_IDS[name]
            self._set_profile_velocity(mid, velocity)
            self._set_goal_position(mid, degrees_to_ticks(angle_deg))

        # Wait for movement to complete (simple time-based estimate).
        # Slower speed_mult -> longer travel time.
        travel_time = 1.0 / max(speed_mult, 0.1)
        time.sleep(min(travel_time, 3.0))

    def _interpolate_waypoints(self, wp_low: list, wp_high: list, t: float) -> list:
        """Linear interpolation between two waypoint sets."""
        return [low + (high - low) * t for low, high in zip(wp_low, wp_high)]

    def _row_to_interpolation_t(self, row: int) -> float:
        """Convert row number to interpolation parameter (0.0 = low, 1.0 = high)."""
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
            print(f"[SO-101] Row {target_row} out of reach, clamping to {row}")

        speed = SPEED_MULT.get(approach_speed, 0.3)
        t = self._row_to_interpolation_t(row)

        # Select approach waypoints based on push direction
        if push_direction == "left_to_right":
            wp_low = self.waypoints.get("approach_left_low", self.waypoints["home"])
            wp_high = self.waypoints.get("approach_left_high", self.waypoints["home"])
        else:
            wp_low = self.waypoints.get("approach_right_low", self.waypoints["home"])
            wp_high = self.waypoints.get("approach_right_high", self.waypoints["home"])

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
        push_pos[2] += push_dist * 3  # Scale factor for joint angle (degrees)
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

        if not self.connected or self.port_handler is None:
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
        "--calibrate", action="store_true", help="Run interactive calibration"
    )
    parser.add_argument("--port", default="/dev/ttyACM0")
    parser.add_argument(
        "--test", action="store_true", help="Test push at row 5 middle"
    )
    args = parser.parse_args()

    ctrl = SO101JengaController(port=args.port)
    ctrl.connect()

    if args.calibrate:
        ctrl.calibrate_interactive()
    elif args.test:
        ctrl.home()
        ctrl.push_block(5, "middle", "left_to_right", "gentle", "slow")
    else:
        print("Use --calibrate or --test")

    ctrl.disconnect()
