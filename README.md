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

## Repository Overview

**12 commits** across 3 branches. ~6,800 lines of application code.

### Branches

| Branch | Owner | Purpose | Status |
|--------|-------|---------|--------|
| `main` | All | Production. Scoring loop + dashboard + infra | Active |
| `chow` | Suet Ling Chow | Dashboard development (React + Vite + Tailwind) | Merged into main |
| `andres` | Andres | Jenga sim exploration (MuJoCo, alternate SOUL.md, SO-101 Jenga controller) | Experimental |

### Main Branch -- File Map

```
niwa/
  scoring/
    niwa_loop.py          # Core NIWA loop (602 lines)
                          #   - Critic/Artist dual-agent scoring cycle
                          #   - Pydantic schemas + guided_json (text models)
                          #   - response_format=json_object (VLMs)
                          #   - Logprobs collection (top-5 per token)
                          #   - Positive-only history filtering (Monea fix)
                          #   - Anti-sycophancy anchoring
                          #   - --mock-robot, --resume, --artist-model flags

  agents/
    critic/SOUL.md        # Critic identity: cautious, scores 6 dimensions
    artist/SOUL.md        # Artist identity: opinionated, develops instincts
    coordinator/
      memory/             # Runtime JSON logs (gitignored, per-run data)

  dashboard/              # React + Vite + Tailwind (TypeScript)
    src/
      App.tsx             # 3 view modes: Overview, Critic, Artist
      hooks/useNiwa.ts    # Polls /data/YYYY-MM-DD.json, maps raw -> panel data
                          #   - Auto-poll on mount (3s interval)
                          #   - Computes RL metrics from iteration data
                          #   - Mock data fallback on first load
      types/niwa.ts       # IterationRaw (backend) + Iteration (panel-ready)
      lib/mockData.ts     # 10-iteration mock with realistic progression
      components/panels/
        CameraFeed.tsx    # Live webcam + score overlay + agent thoughts
        ScoreTimeline.tsx # Line chart: 6 dimensions + overall over iterations
        RadarChart.tsx    # Initial vs current dimension radar (taste drift)
        DebateLog.tsx     # Scrollable Critic priority + Artist instinct log
        PredictionChart.tsx # Predicted vs actual delta (learning signal)
        EmergenceProof.tsx  # Priority drift, accuracy curve, shift events
        RLTrainingPanel.tsx # Reward curve, entropy, human ratings
        RobotStatus.tsx   # Joint positions, FPS, gRPC connection, trajectories
        HumanRating.tsx   # Star rating widget per iteration
        CommandInput.tsx  # Live commands + quick suggestions
      components/ui/
        Panel.tsx         # Reusable panel wrapper with icon/badge
        StatusBar.tsx     # Connection, iteration, score, status display
    vite.config.ts        # Custom middleware: serves /data/ and /photos/ from project root

  robot/
    .gitkeep              # Interface point for robot controllers

  scripts/
    reset.sh              # One-command demo reset (kills loops, clears data)

  docs/
    demo-video-script.md  # 60-second video script (primary + backup)

  deploy/
    .gitkeep              # Containerization placeholder

  .env.example            # Required: NEBIUS_API_KEY
  requirements.txt        # openai, python-dotenv, pydantic, Pillow, matplotlib
```

### Chow Branch (merged)

Built the full dashboard from scratch in 4 commits:
- Vite + React + Tailwind scaffold
- 10 panel components + type system + mock data
- Merged to main with fixes: live data middleware, RL metrics computation, auto-poll

### Andres Branch (experimental)

Jenga tower manipulation variant (+810 lines):
- `robot/so101_jenga.py` (454 lines) -- Dynamixel SDK waypoint-based push controller
- `robot/mock_controller.py` -- Mock with identical interface
- Modified SOUL.md files for stability/risk scoring
- Modified niwa_loop.py schemas for push mechanics (row, position, direction, force)
- Not merged. Arrangement framing retained for demo.

## Models

| Role | Model | Provider | Temp | Purpose |
|------|-------|----------|------|---------|
| Critic | Qwen2.5-VL-72B-Instruct | Nebius Token Factory | 0.3 | Vision scoring (6 dimensions) |
| Artist | gemma-3-27b-it | Nebius Token Factory | 0.5 | Move proposal + prediction |
| Motor | pi0.5 (3B VLA) | Nebius GPU (CompactEncoder) | -- | Camera-to-action, 109 Hz |

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
