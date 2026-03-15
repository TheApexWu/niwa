# NIWA

Zero-training robot manipulation through in-context reinforcement learning.

Two AI agents on Nebius Token Factory learn to arrange physical objects through trial and error. No fine-tuning. No sim-to-real. Just inference.

## Architecture

- **Critic** (Qwen2.5-VL-72B): Scores arrangements on 6 aesthetic dimensions via vision
- **Artist** (MiniMax/Gemma-3-27B): Proposes next move based on score history
- **Robot**: Executes moves. Camera captures result. Loop repeats.

Policy lives entirely in the context window. ~20 iterations, ~5 minutes.

## Structure

```
niwa/
  agents/          # Agent identity and prompt files
    critic/        # Vision-language scoring agent
    artist/        # Move proposal agent
    coordinator/   # Orchestration + memory
      memory/      # Per-run JSON logs
  scoring/         # Core NIWA loop
  dashboard/       # Live visualization (single HTML)
  robot/           # Robot controller interface
  deploy/          # Containerization
  docs/            # Demo scripts, briefings
```

## Built at Nebius.Build SF - March 15, 2026
