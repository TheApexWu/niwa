"""
NIWA - Zero-training robot manipulation through in-context reinforcement learning.

Two agents on Nebius Token Factory learn to arrange physical objects:
  Critic (Qwen2.5-VL-72B) scores arrangements via vision.
  Artist (Gemma-3-27B) proposes moves based on score history.

Usage:
  python scoring/niwa_loop.py --photo-dir ./photos --iterations 20
  python scoring/niwa_loop.py --photo-dir ./photos --iterations 5 --mock-robot
"""

import base64, json, os, sys, time, glob, argparse
from pathlib import Path
from datetime import datetime
from typing import Optional

from dotenv import load_dotenv
load_dotenv()

from openai import OpenAI
from pydantic import BaseModel, Field


# --- Guided JSON Schemas ---
class CriticResponse(BaseModel):
    balance: int = Field(description="Score 0-100 for visual balance/weight distribution")
    spacing: int = Field(description="Score 0-100 for spacing between objects")
    grouping: int = Field(description="Score 0-100 for intentional clustering/grouping")
    negative_space: int = Field(description="Score 0-100 for use of empty space")
    color_harmony: int = Field(description="Score 0-100 for color relationships")
    overall: int = Field(description="Score 0-100 overall aesthetic quality")
    priority: str = Field(description="Which dimension to improve next")
    suggestion: str = Field(description="Specific move suggestion for improvement")
    comparison: Optional[str] = Field(default=None, description="Comparison to previous arrangement")

class ArtistAction(BaseModel):
    block_color: str = Field(description="Color of block to move")
    from_position: int = Field(description="Current grid position (1-4)")
    to_position: int = Field(description="Target grid position (1-4)")

class ArtistResponse(BaseModel):
    action: ArtistAction = Field(description="The move to execute")
    predicted_delta: int = Field(description="Expected overall score change from this move")
    followed_critic: bool = Field(description="Whether this move follows the Critic's suggestion")
    instinct: str = Field(description="Your current aesthetic instinct in one sentence")
    reasoning: str = Field(description="Why you chose this move")

CRITIC_SCHEMA = CriticResponse.model_json_schema()
ARTIST_SCHEMA = ArtistResponse.model_json_schema()

# --- Config ---
CRITIC_MODEL = "Qwen/Qwen2.5-VL-72B-Instruct"
ARTIST_MODEL = "google/gemma-3-27b-it"
MEMORY_WINDOW = 20
DIMENSIONS = ["balance", "spacing", "grouping", "negative_space", "color_harmony", "overall"]
CRITIC_TEMP = 0.3
ARTIST_TEMP = 0.5

client = OpenAI(
    base_url="https://api.studio.nebius.com/v1/",
    api_key=os.environ.get("NEBIUS_API_KEY", ""),
)


def load_soul(agent_dir: str) -> str:
    soul_path = Path(agent_dir) / "SOUL.md"
    return soul_path.read_text() if soul_path.exists() else ""


def build_critic_prompt(photo_b64: str, history: list[dict]) -> list[dict]:
    history_text = ""
    if history:
        window = history[-MEMORY_WINDOW:]
        lines = []

        # Anti-sycophancy anchor
        first = history[0]["scores"]
        lines.append(
            f"Anchor (iter 1): overall={first['overall']}, "
            f"balance={first['balance']}, spacing={first['spacing']}, "
            f"grouping={first['grouping']}, neg_space={first.get('negative_space', '?')}, "
            f"color_harmony={first.get('color_harmony', '?')}"
        )
        lines.append("")

        for h in window:
            s = h["scores"]
            delta_str = f"delta={h['actual_delta']:+d}" if h.get('actual_delta') is not None else "delta=pending"
            follow_str = "followed" if h.get("followed_critic") else "REJECTED"
            lines.append(
                f"Iter {h['iteration']}: overall={s['overall']}, "
                f"balance={s['balance']}, spacing={s['spacing']}, "
                f"grouping={s['grouping']}, color_harmony={s.get('color_harmony', '?')} | "
                f"priority: {h.get('critic_priority', 'not stated')} | "
                f"Artist {follow_str} | {delta_str}"
            )

        if len(history) >= 3:
            recent = history[-3:]
            trends = {}
            for dim in DIMENSIONS:
                if dim == "overall":
                    continue
                vals = [r["scores"].get(dim, 0) for r in recent]
                trends[dim] = vals[-1] - vals[0]
            improving = max(trends, key=trends.get)
            weakest = min(trends, key=trends.get)
            weakest_label = "declining" if trends[weakest] < 0 else "stalling"
            lines.append(
                f"\nTrend: {improving} improving most ({trends[improving]:+d}), "
                f"{weakest} {weakest_label} ({trends[weakest]:+d}). "
                f"Consider shifting priority."
            )

        history_text = "\n\nYour scoring history:\n" + "\n".join(lines)

    return [{
        "role": "user",
        "content": [
            {"type": "text", "text": (
                load_soul("agents/critic") +
                history_text +
                "\n\nScore this arrangement now. Base your scores on what you see, not on history momentum."
            )},
            {"type": "image_url", "image_url": {
                "url": f"data:image/jpeg;base64,{photo_b64}"
            }}
        ]
    }]


def build_artist_prompt(critic_scores: dict, history: list[dict]) -> list[dict]:
    sections = []

    # Follow/reject track record
    if history:
        resolved = [h for h in history if h.get("actual_delta") is not None]
        if len(resolved) >= 2:
            followed_deltas = [h["actual_delta"] for h in resolved if h.get("followed_critic")]
            rejected_deltas = [h["actual_delta"] for h in resolved if not h.get("followed_critic")]
            lines = []
            if followed_deltas:
                avg_f = sum(followed_deltas) / len(followed_deltas)
                lines.append(f"Following critic: avg delta {avg_f:+.1f} ({len(followed_deltas)} moves)")
            if rejected_deltas:
                avg_r = sum(rejected_deltas) / len(rejected_deltas)
                lines.append(f"Rejecting critic: avg delta {avg_r:+.1f} ({len(rejected_deltas)} moves)")

            if followed_deltas and rejected_deltas:
                avg_f = sum(followed_deltas) / len(followed_deltas)
                avg_r = sum(rejected_deltas) / len(rejected_deltas)
                if avg_f > avg_r:
                    lines.append(f"DATA: Following produces better results ({avg_f:+.1f} vs {avg_r:+.1f}).")
                elif avg_r > avg_f:
                    lines.append(f"DATA: Rejecting outperforms following ({avg_r:+.1f} vs {avg_f:+.1f}).")
            elif rejected_deltas and not followed_deltas:
                avg_r = sum(rejected_deltas) / len(rejected_deltas)
                if avg_r <= 0:
                    lines.append("DATA: You have never followed and rejections average non-positive. Try following.")

            if lines:
                sections.append("Your track record:\n" + "\n".join(lines))

        # Consecutive rejection awareness
        consec_rejects = 0
        for h in reversed(history):
            if not h.get("followed_critic", True):
                consec_rejects += 1
            else:
                break
        if consec_rejects >= 4:
            sections.append(
                f"You have rejected {consec_rejects} times consecutively. "
                f"Follow the Critic unless your rejection track record is positive."
            )
        elif consec_rejects >= 2:
            sections.append(
                f"You have rejected {consec_rejects} times in a row. "
                f"Check your rejection avg delta before deciding again."
            )

    # Current scores
    critic_lines = [
        f"Overall score: {critic_scores.get('overall', '?')}",
        f"Critic priority: {critic_scores.get('priority', 'not stated')}",
        f"Critic suggestion: {critic_scores.get('suggestion', 'none')}",
        f"Dimensions: {', '.join(f'{d}={critic_scores.get(d, '?')}' for d in DIMENSIONS if d != 'overall')}",
    ]
    sections.append("Current arrangement:\n" + "\n".join(critic_lines))

    # Move history -- only show positive-delta iterations to prevent Monea degeneration
    if history:
        resolved = [h for h in history if h.get("actual_delta") is not None]
        positive = [h for h in resolved if h["actual_delta"] > 0]
        negative = [h for h in resolved if h["actual_delta"] <= 0]
        if resolved:
            move_lines = []
            # Feed positive examples as learning signal
            for h in positive[-MEMORY_WINDOW:]:
                move = h.get("move", {})
                move_desc = f"{move.get('block_color', '?')} pos {move.get('from_position', '?')}->{move.get('to_position', '?')}"
                follow_str = "followed" if h.get("followed_critic") else "rejected"
                move_lines.append(f"  {move_desc} ({follow_str}, delta: {h['actual_delta']:+d})")
            if move_lines:
                sections.append(f"Successful moves ({len(positive)}/{len(resolved)} produced gains):\n" + "\n".join(move_lines))
            if negative:
                sections.append(f"{len(negative)} moves produced no gain. Avoid repeating similar patterns.")

        # Prediction calibration
        calibration = [(h.get("predicted_delta", 0), h["actual_delta"])
                       for h in resolved if h.get("predicted_delta") is not None]
        if calibration:
            avg_error = sum(abs(p - a) for p, a in calibration) / len(calibration)
            sections.append(f"Your prediction avg error: {avg_error:.1f} points.")

        # Dimension trends
        if len(history) >= 3:
            recent = history[-3:]
            trend_parts = []
            for dim in DIMENSIONS:
                if dim == "overall":
                    continue
                vals = [r["scores"].get(dim, 0) for r in recent]
                delta = vals[-1] - vals[0]
                if abs(delta) >= 3:
                    direction = "improving" if delta > 0 else "declining"
                    trend_parts.append(f"{dim} {direction} ({delta:+d})")
            if trend_parts:
                sections.append("Trends (last 3): " + ", ".join(trend_parts))

    return [{
        "role": "user",
        "content": [{
            "type": "text",
            "text": (
                load_soul("agents/artist") +
                "\n\n" + "\n\n".join(sections) +
                "\n\nDecide your next move."
            )
        }]
    }]


def call_model(model: str, messages: list[dict], max_tokens: int = 400,
               temperature: float = 0.4, schema: dict = None) -> dict:
    for attempt in range(2):
        kwargs = dict(
            model=model, messages=messages,
            temperature=temperature, max_tokens=max_tokens,
            response_format={"type": "json_object"},
        )
        # guided_json only works on text-only models, not VLMs
        if schema and "VL" not in model:
            kwargs["extra_body"] = {"guided_json": schema}

        response = client.chat.completions.create(**kwargs)
        raw = response.choices[0].message.content
        if raw is None:
            if attempt == 0:
                print("  [retry] empty response, retrying...")
                continue
            return {}
        raw = raw.strip()

        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw.rsplit("```", 1)[0]
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                return json.loads(raw[start:end])
            except json.JSONDecodeError:
                if attempt == 0:
                    print("  [retry] malformed JSON, retrying...")
                    continue
                raise
    return {}


def wait_for_photo(photo_dir: Path, seen: set) -> str:
    print("\n>> Waiting for photo in:", photo_dir)
    while True:
        files = set(glob.glob(str(photo_dir / "*.jpg"))) | set(glob.glob(str(photo_dir / "*.jpeg"))) | set(glob.glob(str(photo_dir / "*.png")))
        new = files - seen
        if new:
            return max(new, key=os.path.getmtime)
        time.sleep(1)


def log_iteration(memory_dir: Path, iteration_data: dict):
    memory_dir.mkdir(parents=True, exist_ok=True)
    date_str = datetime.now().strftime("%Y-%m-%d")
    memory_file = memory_dir / f"{date_str}.json"
    existing = []
    if memory_file.exists():
        existing = json.loads(memory_file.read_text())
    existing.append(iteration_data)
    memory_file.write_text(json.dumps(existing, indent=2))


def compute_stats(history: list[dict]) -> dict:
    if len(history) < 3:
        return {}
    overall_scores = [h["scores"]["overall"] for h in history]
    deltas = [overall_scores[i] - overall_scores[i-1] for i in range(1, len(overall_scores))]
    prediction_errors = [
        abs((h.get("predicted_delta") or 0) - (h.get("actual_delta") or 0))
        for h in history if h.get("actual_delta") is not None
    ]
    follow_count = sum(1 for h in history if h.get("followed_critic", True))
    return {
        "score_trend": "improving" if sum(deltas[-3:]) > 0 else "plateauing" if sum(deltas[-3:]) == 0 else "declining",
        "avg_prediction_error": round(sum(prediction_errors) / max(len(prediction_errors), 1), 1),
        "follow_rate": round(follow_count / len(history) * 100, 1),
        "best_overall": max(overall_scores),
        "worst_overall": min(overall_scores),
        "score_range": max(overall_scores) - min(overall_scores),
    }


def plot_results(history: list[dict], output_path: str):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("pip install matplotlib for plots")
        return

    fig, axes = plt.subplots(3, 1, figsize=(12, 10), sharex=True)
    iterations = [h["iteration"] for h in history]

    all_scores = [h["scores"].get(dim, 0) for h in history for dim in DIMENSIONS]
    y_min = max(0, min(all_scores) - 5)
    y_max = min(100, max(all_scores) + 10)

    # Dimension scores
    ax1 = axes[0]
    for dim in DIMENSIONS:
        if dim == "overall":
            continue
        values = [h["scores"].get(dim, 0) for h in history]
        ax1.plot(iterations, values, marker="o", label=dim, linewidth=1.5, markersize=4)
    ax1.set_ylabel("Score")
    ax1.set_title("NIWA: Aesthetic Dimension Scores")
    ax1.legend(fontsize=8, loc="upper left")
    ax1.grid(True, alpha=0.3)
    ax1.set_ylim(y_min, y_max)

    # Overall + follow/reject
    ax2 = axes[1]
    overall = [h["scores"].get("overall", 0) for h in history]
    followed = [h.get("followed_critic", True) for h in history]
    colors = ["#2a9d8f" if f else "#e63946" for f in followed]
    ax2.plot(iterations, overall, marker="s", color="#264653", linewidth=2, label="overall")
    ax2.scatter(iterations, overall, c=colors, s=60, zorder=5, edgecolors="white", linewidths=0.5)
    ax2.fill_between(iterations, overall, alpha=0.1, color="#264653")
    ax2.set_ylabel("Overall Score")
    ax2.set_title("Overall Score (green=followed, red=rejected)")
    ax2.grid(True, alpha=0.3)
    ax2.set_ylim(y_min, y_max)

    # Predicted vs actual delta
    ax3 = axes[2]
    if len(history) > 1:
        pred_deltas = [h.get("predicted_delta") or 0 for h in history[1:]]
        actual_deltas = [h.get("actual_delta") or 0 for h in history[1:]]
        iters_delta = iterations[1:]
        ax3.plot(iters_delta, pred_deltas, marker="^", label="predicted", color="#e9c46a", linewidth=1.5)
        ax3.plot(iters_delta, actual_deltas, marker="v", label="actual", color="#264653", linewidth=1.5)
        ax3.axhline(y=0, color="gray", linestyle="--", alpha=0.5)
        ax3.fill_between(iters_delta, pred_deltas, actual_deltas, alpha=0.15, color="#e76f51")
    ax3.set_xlabel("Iteration")
    ax3.set_ylabel("Score Delta")
    ax3.set_title("Predicted vs Actual Delta")
    ax3.legend(fontsize=8)
    ax3.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig(output_path, dpi=150)
    print(f"\nPlot saved: {output_path}")


def main():
    parser = argparse.ArgumentParser(description="NIWA two-agent ICRL loop")
    parser.add_argument("--photo-dir", default="./photos")
    parser.add_argument("--iterations", type=int, default=20)
    parser.add_argument("--output", default="niwa_evolution.png")
    parser.add_argument("--mock-robot", action="store_true")
    parser.add_argument("--live-camera", action="store_true", help="Capture from webcam instead of polling directory")
    parser.add_argument("--resume", type=str, default=None, help="Resume from a previous run JSON file")
    parser.add_argument("--artist-model", type=str, default=None, help="Override artist model (e.g. MiniMaxAI/MiniMax-M2.1)")
    args = parser.parse_args()

    photo_dir = Path(args.photo_dir)
    photo_dir.mkdir(parents=True, exist_ok=True)
    memory_dir = Path("agents/coordinator/memory")

    if not os.environ.get("NEBIUS_API_KEY"):
        print("ERROR: Set NEBIUS_API_KEY in .env")
        sys.exit(1)

    # Allow model override
    global ARTIST_MODEL
    if args.artist_model:
        ARTIST_MODEL = args.artist_model

    robot = None
    if args.mock_robot:
        from robot.mock_controller import MockController
        robot = MockController()
        robot.connect()

    print("=" * 60)
    print("NIWA - In-Context Reinforcement Learning")
    print("=" * 60)
    print(f"Critic: {CRITIC_MODEL} (temp={CRITIC_TEMP})")
    print(f"Artist: {ARTIST_MODEL} (temp={ARTIST_TEMP})")
    print(f"Memory window: {MEMORY_WINDOW}")
    print(f"Photo dir: {photo_dir.resolve()}")
    print(f"Robot: {'mock' if args.mock_robot else 'manual'}")
    print(f"Target: {args.iterations} iterations")
    print()

    # Resume from previous run
    history = []
    seen_photos = set()
    prev_overall = None
    start_iter = 1

    if args.resume:
        resume_path = Path(args.resume)
        if resume_path.exists():
            history = json.loads(resume_path.read_text())
            seen_photos = {h["photo"] for h in history}
            start_iter = len(history) + 1
            prev_overall = history[-1]["scores"]["overall"] if history else None
            print(f"Resumed from {resume_path}: {len(history)} iterations loaded")
            print(f"Continuing from iteration {start_iter}")
            print()

    for i in range(start_iter, args.iterations + 1):
        print(f"\n{'='*60}")
        print(f"ITERATION {i}/{args.iterations}")
        print("=" * 60)

        if args.live_camera:
            photo_path = str(photo_dir / f"frame_{i:03d}.jpg")
            capture_frame(photo_path)
        else:
            photo_path = wait_for_photo(photo_dir, seen_photos)
        seen_photos.add(photo_path)
        print(f"  Photo: {os.path.basename(photo_path)}")

        with open(photo_path, "rb") as f:
            photo_b64 = base64.b64encode(f.read()).decode()

        # --- Critic ---
        print("  Calling Critic...")
        t0 = time.time()
        try:
            critic_msgs = build_critic_prompt(photo_b64, history)
            critic_result = call_model(CRITIC_MODEL, critic_msgs, max_tokens=400, temperature=CRITIC_TEMP, schema=CRITIC_SCHEMA)
        except Exception as e:
            print(f"  CRITIC ERROR: {e}")
            continue
        critic_time = time.time() - t0

        scores = {}
        for dim in DIMENSIONS:
            val = critic_result.get(dim, 0)
            try:
                val = max(0, min(100, int(val)))
            except (ValueError, TypeError):
                val = 0
            scores[dim] = val
        critic_priority = critic_result.get("priority", "not stated")

        print(f"  Critic ({critic_time:.1f}s):")
        print(f"    priority: {critic_priority[:100]}")
        for dim in DIMENSIONS:
            print(f"    {dim}: {scores[dim]}")
        print(f"    suggestion: {critic_result.get('suggestion', '?')}")

        # --- Artist ---
        print("  Calling Artist...")
        t0 = time.time()
        try:
            artist_msgs = build_artist_prompt(critic_result, history)
            artist_max_tokens = 2000 if "MiniMax" in ARTIST_MODEL else 300
            artist_result = call_model(ARTIST_MODEL, artist_msgs, max_tokens=artist_max_tokens, temperature=ARTIST_TEMP, schema=ARTIST_SCHEMA)
        except Exception as e:
            print(f"  ARTIST ERROR: {e}")
            continue
        artist_time = time.time() - t0

        move = artist_result.get("action", {})
        try:
            predicted_delta = int(artist_result.get("predicted_delta", 0) or 0)
        except (ValueError, TypeError):
            predicted_delta = 0
        followed = artist_result.get("followed_critic", True)

        current_overall = scores.get("overall", 0)
        if prev_overall is not None and len(history) > 0:
            history[-1]["actual_delta"] = current_overall - prev_overall

        print(f"  Artist ({artist_time:.1f}s):")
        print(f"    instinct: {artist_result.get('instinct', 'not stated')[:100]}")
        print(f"    move: {move.get('block_color', '?')} pos {move.get('from_position', '?')}->{move.get('to_position', '?')}")
        print(f"    predicted delta: {predicted_delta:+d}")
        print(f"    followed critic: {followed}")

        iteration_data = {
            "iteration": i,
            "timestamp": datetime.now().isoformat(),
            "photo": os.path.basename(photo_path),
            "scores": scores,
            "critic_priority": critic_priority,
            "critic_suggestion": critic_result.get("suggestion", ""),
            "critic_comparison": critic_result.get("comparison"),
            "move": move,
            "predicted_delta": predicted_delta,
            "actual_delta": None,
            "followed_critic": followed,
            "artist_instinct": artist_result.get("instinct", ""),
            "artist_reasoning": artist_result.get("reasoning", ""),
            "api_time_critic": round(critic_time, 2),
            "api_time_artist": round(artist_time, 2),
        }
        history.append(iteration_data)
        log_iteration(memory_dir, iteration_data)
        prev_overall = current_overall

        if len(history) >= 3:
            stats = compute_stats(history)
            print(f"\n  STATS: trend={stats['score_trend']}, "
                  f"follow={stats['follow_rate']}%, "
                  f"pred_err={stats['avg_prediction_error']}, "
                  f"range={stats['score_range']}")

        if robot and move:
            print("  Executing move...")
            robot.execute_move(move)
        else:
            print(f"\n  >> Execute move, then drop next photo.")

    # Save
    data_path = args.output.replace(".png", ".json")
    with open(data_path, "w") as f:
        json.dump(history, f, indent=2)
    print(f"\nData saved: {data_path}")

    if history:
        plot_results(history, args.output)

    if len(history) >= 3:
        stats = compute_stats(history)
        print(f"\n{'='*60}")
        print("FINAL STATS")
        print("=" * 60)
        print(f"  Iterations: {len(history)}")
        print(f"  Trend: {stats['score_trend']}")
        print(f"  Range: {stats['score_range']} (best={stats['best_overall']}, worst={stats['worst_overall']})")
        print(f"  Follow rate: {stats['follow_rate']}%")
        print(f"  Avg prediction error: {stats['avg_prediction_error']}")
        total_api = sum(h["api_time_critic"] + h["api_time_artist"] for h in history)
        print(f"  Total API time: {total_api:.0f}s ({total_api/len(history):.1f}s/iter)")


def capture_frame(output_path: str):
    """Capture a single frame from webcam."""
    try:
        import cv2
        cap = cv2.VideoCapture(0)
        ret, frame = cap.read()
        if ret:
            cv2.imwrite(output_path, frame)
        cap.release()
    except ImportError:
        print("pip install opencv-python for live camera")
        sys.exit(1)


if __name__ == "__main__":
    main()
