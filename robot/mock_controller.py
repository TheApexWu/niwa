"""Mock robot controller for testing NIWA Jenga without hardware."""


class MockController:
    """Simulates robot movements by printing actions to console."""

    def connect(self):
        print("[mock-robot] Connected (mock mode)")

    def home(self):
        print("[mock-robot] Moving to home position")

    def push_block(self, target_row: int, target_position: str,
                   push_direction: str, push_force: str = "gentle",
                   approach_speed: str = "slow"):
        print(f"[mock-robot] PUSH: row {target_row}, {target_position}, "
              f"{push_direction}, force={push_force}, speed={approach_speed}")
        print(f"[mock-robot] Approaching target...")
        print(f"[mock-robot] Pushing...")
        print(f"[mock-robot] Retracting to safe position")

    def execute_move(self, move: dict):
        """Adapter for the main loop's move dict."""
        self.push_block(
            target_row=move.get("target_row", 5),
            target_position=move.get("target_position", "middle"),
            push_direction=move.get("push_direction", "left_to_right"),
            push_force=move.get("push_force", "gentle"),
            approach_speed=move.get("approach_speed", "slow"),
        )

    def disconnect(self):
        print("[mock-robot] Disconnected")
