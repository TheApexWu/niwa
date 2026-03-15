# NIWA Demo Video Script (60 seconds)

## Primary Script (Robot Working)

### [0:00-0:05] HOOK
**Camera:** Tight on blocks in messy arrangement on table
**VO:** "This robot has never seen these objects before. No training data. No fine-tuning. Watch what happens."

### [0:05-0:12] FIRST MOVE
**Camera:** Wide shot showing SO-101 arm, blocks, table. Robot picks up a block and places it.
**VO:** "Two VLM agents running on Nebius cloud are debating what looks good. The Critic scores the arrangement. The Artist proposes the next move. The robot executes."

### [0:12-0:22] SCORE CLIMBING
**Camera:** Cut to dashboard on laptop. Score timeline visible, reward curve trending up. Cut back to robot making another move.
**VO:** "Every iteration, scores climb. Not because we told it what 'good' means, but because the agents develop their own aesthetic preferences through feedback loops. No weights updated. No gradient descent. Pure in-context adaptation."

### [0:22-0:32] GOAL SWITCH
**Camera:** Dashboard showing the goal switch moment. Then wide shot of robot adjusting.
**VO:** "Now we switch the goal mid-run. Instead of symmetry, optimize for height. Watch the scores drop, then re-converge. The system figures out the new objective on its own."

### [0:32-0:42] SCRAMBLE RECOVERY
**Camera:** A hand reaches in and shoves the blocks into a mess. Hold on the chaos. Then robot starts correcting.
**VO:** "And if someone disrupts the arrangement? The Critic sees the damage, the Artist replans, the robot recovers. No human intervention."

### [0:42-0:50] ARCHITECTURE
**Camera:** Split screen or quick cut: camera frame uploading, dashboard debate log scrolling, robot moving.
**VO:** "Camera frames go up to Nebius cloud. Qwen 72B and Gemma 27B run on Token Factory GPUs. Decisions stream back to a custom Rust controller. Cloud-to-robot AI. Real hardware. Real latency."

### [0:50-0:60] PLATFORM VISION
**Camera:** Pull back to wide shot. Robot finishes a clean arrangement. Dashboard shows final scores.
**VO:** "Blocks are the proof case. The platform works for any manipulation task, any object, any robot. An IRL RL gym, running on Nebius. Zero training required."

---

## Backup Script (Manual Block Moves)

Same timing and structure. Three changes:

### [0:00-0:05] HOOK
**Camera:** Tight on blocks in messy arrangement
**VO:** "This system has never seen these objects before. No training data. No fine-tuning. Watch what happens."
(Drop "robot," say "system.")

### [0:05-0:12] FIRST MOVE
**Camera:** Dashboard showing the Artist's proposed move with coordinates. A hand moves the block to the suggested position. Dashboard updates.
**VO:** "Two VLM agents on Nebius cloud debate what looks good. The Critic scores. The Artist proposes coordinates. We execute the move. The system sees the result and iterates."
(Show dashboard instruction BEFORE hand moves. Proves the system is directing, not the human.)

### [0:12-0:22] SCORE CLIMBING
Same as primary, add: "Today we're moving blocks by hand. In production, the robot arm executes autonomously."
(Acknowledge manual execution once, briefly, then move on. Don't apologize.)

### [0:22-0:60] REST
Same as primary. Goal switch is a software moment. Architecture pitch doesn't change. For platform vision, add: "The manipulation layer is modular. Rust controller, robot arm, or human hand -- the brain doesn't care."

---

## Filming Notes

1. Record voiceover separately. Do not talk over live audio.
2. Dashboard must be legible. Zoom browser to 150%. Close all other tabs.
3. Camera angle for robot: 45 degrees above and to the side. Show full workspace.
4. For the scramble moment: pause 1 full second on the mess before system responds. Contrast is the wow.
5. For backup script: frame the laptop prominently. Dashboard IS the demo. Show Artist's move instruction on screen BEFORE hand moves every time.
6. Total footage needed: ~3 min raw minimum. Cut tight. No dead air.

---

## Risk Notes

**Fragile:** Goal-switch re-convergence might be slow on camera. Pre-run and screen-record a clean version.

**Breaks first:** Scramble recovery. If Critic gives a high score to the mess, the narrative falls apart. Test 3x before filming. If it fails more than once, cut the segment and extend goal-switch to fill time.
