# NIWA

An IRL reinforcement learning gym running on Nebius cloud infrastructure.

Two layers: cloud inference removes the hardware ceiling, and a VLM scoring loop adds intelligence on top. No fine-tuning. No sim-to-real transfer. Zero training required.

## How It Works

**Infrastructure Layer** (Body): A pi0.5 Vision-Language-Action model runs on Nebius GPU. A custom CompactEncoder achieves 7.3x faster inference than SigLIP (9ms vs 67ms end-to-end). Actions stream to the robot via a Rust controller at 109 Hz.

**Intelligence Layer** (Brain): Two VLM agents on Nebius Token Factory run a closed-loop scoring cycle:
- **Critic** (Qwen2.5-VL-72B): Scores physical arrangements on 6 dimensions via vision. Develops priorities not specified in its prompt.
- **Artist** (Gemma-3-27B): Proposes moves based on score history. Builds prediction accuracy over iterations.
- Over ~20 iterations, scores improve, priorities drift, and the Artist's predictions converge -- all through in-context adaptation with reward feedback. No weights updated.

**Environment**: Physical table + camera. Robot executes moves. Camera captures result. Critic scores. Artist proposes. Loop repeats.

## Architecture

```
Camera Frame --> Nebius Cloud (Token Factory GPU)
                    |
          Critic (72B VLM) scores arrangement
                    |
          Artist (27B) proposes next move
                    |
          Policy Server streams action
                    |
                Robot Arm <-- Rust Controller (CompactEncoder, 109 Hz)
                    |
              Camera captures new state
                    |
                 (repeat)
```

## Structure

```
niwa/
  agents/          # Agent identity and prompt files
    critic/        # Vision-language scoring agent
    artist/        # Move proposal agent
    coordinator/   # Orchestration + memory
      memory/      # Per-run JSON logs (iteration data + logprobs)
  scoring/         # Core NIWA loop (niwa_loop.py)
  dashboard/       # Live React dashboard (10 panels, real-time polling)
  robot/           # Robot controller interface + MuJoCo sim
  docs/            # Demo scripts
```

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Run the scoring loop (mock robot)
python scoring/niwa_loop.py --photo-dir ./photos --iterations 20 --mock-robot

# Run the dashboard
cd dashboard && npm install && npm run dev
```

## Team

- **Amadeus Wu** -- VLM scoring system, agent design, dashboard, taste thesis
- **Arnaud Denis-Remillard** -- Rust robot controller, CompactEncoder, cloud inference pipeline
- **Lucas Cielo Miranda** -- GPU inference optimization, MuJoCo sim, pi0.5 integration
- **Suet Ling Chow** -- Dashboard, integration, demo production

## Built at Nebius.Build SF -- March 15, 2026
