// ---- Scoring dimensions (extensible) ----
export type DimensionKey = string;

export const DEFAULT_DIMENSIONS: DimensionKey[] = [
  'stability',
  'block_looseness',
  'risk_level',
  'move_success',
  'overall',
];

export interface DimensionScores {
  [key: string]: number; // 1-100
}

// ---- Jenga move types ----
export type PushForce = 'gentle' | 'medium' | 'firm';
export type PushSpeed = 'slow' | 'normal';
export type BlockPosition = 'left' | 'middle' | 'right';
export type PushDirection = 'left_to_right' | 'right_to_left';

export interface MoveCommand {
  target_row: number;
  target_position: BlockPosition;
  push_direction: PushDirection;
  push_force: PushForce;
  approach_speed: PushSpeed;
}

// ---- Raw iteration data from niwa_loop.py JSON output ----
export interface IterationRaw {
  iteration: number;
  timestamp: string;
  photo: string;
  scores: Record<string, number>;
  critic_priority: string;
  critic_suggestion: string;
  critic_comparison: string | null;
  critic_target_row?: number;
  critic_target_position?: string;
  critic_push_direction?: string;
  move: {
    target_row?: number;
    target_position?: string;
    push_direction?: string;
    push_force?: string;
    approach_speed?: string;
  };
  predicted_delta: number;
  actual_delta: number | null;
  followed_critic: boolean;
  artist_instinct: string;
  artist_reasoning: string;
  api_time_critic: number;
  api_time_artist: number;
}

// ---- Agent outputs (mapped from raw for panels) ----
export interface CriticOutput {
  priority: string;
  scores: DimensionScores;
  suggestion: MoveCommand;
  reasoning: string;
  artist_feedback: string;
}

export interface ArtistOutput {
  instinct: string;
  move: MoveCommand;
  predicted_delta: number;
  followed_critic: boolean;
  rejection_reasoning?: string;
}

// ---- Iteration (panel-ready, mapped from raw) ----
export interface Iteration {
  id: number;
  timestamp: string;
  image_url?: string;
  critic: CriticOutput;
  artist: ArtistOutput;
  actual_delta: number;
  overall_score: number;
  dimension_scores: DimensionScores;
  priority_changed: boolean;
  instinct_changed: boolean;
  human_rating?: number;
  robot_execution?: {
    trajectory_id: string;
    execution_time_ms: number;
    inference_time_ms: number;
    network_latency_ms: number;
    joints_before: Record<string, number>;
    joints_after: Record<string, number>;
  };
}

// ---- Robot hardware state ----
export const SO101_JOINTS = [
  'shoulder_pan',
  'shoulder_lift',
  'elbow_flex',
  'wrist_flex',
  'wrist_roll',
  'gripper',
] as const;

export type SO101JointName = typeof SO101_JOINTS[number];

export interface RobotHardwareState {
  connection: 'disconnected' | 'connecting' | 'handshake' | 'streaming' | 'error';
  joint_positions: Record<string, number>;
  joint_targets?: Record<string, number>;
  action_queue_size: number;
  action_chunk_size: number;
  fps_actual: number;
  fps_target: number;
  last_action_timestep: number;
  calibrated: boolean;
  trajectories_loaded: number;
  current_trajectory?: string;
}

// ---- RL Training metrics ----
export interface RLTrainingMetrics {
  total_episodes: number;
  mean_reward_last_10: number;
  reward_history: number[];
  policy_entropy: number;
  value_loss: number;
  human_ratings: { iteration: number; rating: number; timestamp: string }[];
  recommendation_history: MoveCommand[];
}

// ---- Full system state ----
export interface NiwaState {
  status: 'idle' | 'running' | 'paused' | 'recovery';
  current_iteration: number;
  iterations: Iteration[];
  overall_score: number;
  latest_image?: string;
  initial_priorities: DimensionScores;
  current_priorities: DimensionScores;
  prediction_accuracy: number[];
  follow_rate: number[];
  active_dimensions: DimensionKey[];
  cloud_endpoint: string;
  model_critic: string;
  model_artist: string;
  robot_status: 'connected' | 'disconnected' | 'moving' | 'idle';
  robot_hardware?: RobotHardwareState;
  policy_server?: {
    host: string;
    port: number;
    fps: number;
    inference_latency: number;
    obs_queue_timeout: number;
  };
  robot_client?: {
    robot_type: string;
    robot_id: string;
    server_address: string;
    policy_type: string;
    actions_per_chunk: number;
    chunk_size_threshold: number;
    policy_device: string;
    client_device: string;
  };
  rl_metrics?: RLTrainingMetrics;
}

// ---- Command input ----
export interface UserCommand {
  text: string;
  timestamp: string;
}

// ---- View mode ----
export type ViewMode = 'overview' | 'critic' | 'artist';
