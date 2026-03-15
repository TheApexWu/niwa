import { useState, useEffect, useCallback, useRef } from 'react';
import type { NiwaState, Iteration, UserCommand, RLTrainingMetrics, IterationRaw } from '../types/niwa';
import { MOCK_STATE, EMPTY_STATE } from '../lib/mockData';

const POLL_INTERVAL = 3000;

interface UseNiwaReturn {
  state: NiwaState;
  connected: boolean;
  sendCommand: (text: string) => void;
  sendRating: (iterationId: number, rating: number) => void;
  commandHistory: UserCommand[];
  toggleSimulation: () => void;
  isSimulating: boolean;
  scramble: () => void;
  registerCapture: (fn: () => string | null) => void;
  rlMetrics: RLTrainingMetrics | null;
}

/** Map a raw iteration from niwa_loop.py JSON to the panel-ready Iteration type */
function mapRawIteration(raw: IterationRaw, prevRaw: IterationRaw | null): Iteration {
  return {
    id: raw.iteration,
    timestamp: raw.timestamp,
    image_url: raw.photo,
    critic: {
      priority: raw.critic_priority,
      scores: raw.scores,
      suggestion: {
        target_row: raw.critic_target_row ?? raw.move?.target_row ?? 5,
        target_position: ((raw.critic_target_position ?? raw.move?.target_position) as 'left' | 'middle' | 'right') || 'middle',
        push_direction: ((raw.critic_push_direction ?? raw.move?.push_direction) as 'left_to_right' | 'right_to_left') || 'left_to_right',
        push_force: (raw.move?.push_force as 'gentle' | 'medium' | 'firm') || 'gentle',
        approach_speed: (raw.move?.approach_speed as 'slow' | 'normal') || 'slow',
      },
      reasoning: raw.critic_suggestion,
      artist_feedback: raw.critic_comparison || '',
    },
    artist: {
      instinct: raw.artist_instinct,
      move: {
        target_row: raw.move?.target_row ?? 5,
        target_position: (raw.move?.target_position as 'left' | 'middle' | 'right') || 'middle',
        push_direction: (raw.move?.push_direction as 'left_to_right' | 'right_to_left') || 'left_to_right',
        push_force: (raw.move?.push_force as 'gentle' | 'medium' | 'firm') || 'gentle',
        approach_speed: (raw.move?.approach_speed as 'slow' | 'normal') || 'slow',
      },
      predicted_delta: raw.predicted_delta,
      followed_critic: raw.followed_critic,
      rejection_reasoning: !raw.followed_critic ? raw.artist_reasoning : undefined,
    },
    actual_delta: raw.actual_delta ?? 0,
    overall_score: raw.scores.overall ?? 0,
    dimension_scores: raw.scores,
    priority_changed: prevRaw ? raw.critic_priority !== prevRaw.critic_priority : false,
    instinct_changed: prevRaw ? raw.artist_instinct !== prevRaw.artist_instinct : false,
  };
}

/** Map an array of raw iterations to a full NiwaState */
function buildStateFromRaw(rawIterations: IterationRaw[]): NiwaState {
  const iterations = rawIterations.map((raw, i) =>
    mapRawIteration(raw, i > 0 ? rawIterations[i - 1] : null)
  );

  const latest = iterations[iterations.length - 1];
  const first = iterations[0];

  const predictionAccuracy = iterations.map(
    (it) => Math.abs(it.artist.predicted_delta - it.actual_delta)
  );

  const followRate = iterations.map((_, i) => {
    const slice = iterations.slice(0, i + 1);
    return slice.filter((it) => it.artist.followed_critic).length / slice.length;
  });

  return {
    ...EMPTY_STATE,
    status: 'running',
    current_iteration: latest?.id ?? 0,
    iterations,
    overall_score: latest?.overall_score ?? 0,
    initial_priorities: first?.dimension_scores ?? EMPTY_STATE.initial_priorities,
    current_priorities: latest?.dimension_scores ?? EMPTY_STATE.current_priorities,
    prediction_accuracy: predictionAccuracy,
    follow_rate: followRate,
  };
}

export function useNiwa(): UseNiwaReturn {
  const [state, setState] = useState<NiwaState>(MOCK_STATE);
  const [connected, setConnected] = useState(false);
  const [commandHistory, setCommandHistory] = useState<UserCommand[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [rlMetrics, setRlMetrics] = useState<RLTrainingMetrics | null>(null);
  const captureFrameFnRef = useRef<(() => string | null) | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastDataLengthRef = useRef(0);

  const registerCapture = useCallback((fn: () => string | null) => {
    captureFrameFnRef.current = fn;
  }, []);

  // Compute RL metrics from iteration data
  const computeRLMetrics = useCallback((iterations: Iteration[]): RLTrainingMetrics | null => {
    if (iterations.length < 2) return null;
    const rewards = iterations.map((it) => it.actual_delta / 100);
    const last10 = rewards.slice(-10);
    const meanLast10 = last10.reduce((s, v) => s + v, 0) / last10.length;
    const followRate = iterations.filter((it) => it.artist.followed_critic).length / iterations.length;
    const humanRatings = iterations
      .filter((it) => it.human_rating !== undefined)
      .map((it) => ({ iteration: it.id, rating: it.human_rating!, timestamp: it.timestamp }));
    return {
      reward_history: rewards,
      mean_reward_last_10: meanLast10,
      policy_entropy: 1 - followRate,
      total_episodes: iterations.length,
      human_ratings: humanRatings,
      value_loss: 0,
      recommendation_history: [],
    };
  }, []);

  // Poll the iteration JSON file
  const pollData = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    try {
      const res = await fetch(`/data/${today}.json`, { cache: 'no-store' });
      if (!res.ok) return;
      const rawIterations: IterationRaw[] = await res.json();
      if (rawIterations.length > 0 && rawIterations.length !== lastDataLengthRef.current) {
        lastDataLengthRef.current = rawIterations.length;
        const newState = buildStateFromRaw(rawIterations);
        setState(newState);
        setConnected(true);
        setRlMetrics(computeRLMetrics(newState.iterations));
      }
    } catch {
      // Backend not available, keep current state (mock or last known)
    }
  }, [computeRLMetrics]);

  // Auto-poll on mount + toggle
  const toggleSimulation = useCallback(() => {
    setIsSimulating((prev) => {
      const next = !prev;
      if (next) {
        pollData();
        pollIntervalRef.current = setInterval(pollData, POLL_INTERVAL);
      } else {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        setState((prev) => ({ ...prev, status: 'paused' }));
      }
      return next;
    });
  }, [pollData]);

  // Auto-start polling on mount
  useEffect(() => {
    pollData();
    pollIntervalRef.current = setInterval(pollData, POLL_INTERVAL);
    setIsSimulating(true);
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [pollData]);

  // Scramble (recovery test)
  const scramble = useCallback(() => {
    setState((prev) => ({
      ...prev,
      status: 'recovery',
      iterations: [
        ...prev.iterations,
        {
          id: prev.current_iteration + 1,
          timestamp: new Date().toISOString(),
          critic: {
            priority: 'RECOVERY MODE: Tower collapsed. Rebuilding strategy from scratch.',
            scores: Object.fromEntries(
              prev.active_dimensions.map((d) => [d, Math.floor(Math.random() * 20) + 10]),
            ),
            suggestion: { target_row: 5, target_position: 'middle' as const, push_direction: 'left_to_right' as const, push_force: 'gentle' as const, approach_speed: 'slow' as const },
            reasoning: 'Chaos detected. Falling back to learned priorities.',
            artist_feedback: 'System disrupted. Activating recovery.',
          },
          artist: {
            instinct: 'Scramble detected. Trusting learned instincts.',
            move: { target_row: 5, target_position: 'middle' as const, push_direction: 'left_to_right' as const, push_force: 'gentle' as const, approach_speed: 'slow' as const },
            predicted_delta: 8,
            followed_critic: false,
            rejection_reasoning: 'Even in recovery, I trust my learned row and force preferences.',
          },
          actual_delta: 10,
          overall_score: 22,
          dimension_scores: Object.fromEntries(
            prev.active_dimensions.map((d) => [d, Math.floor(Math.random() * 20) + 10]),
          ),
          priority_changed: false,
          instinct_changed: false,
        },
      ],
      current_iteration: prev.current_iteration + 1,
    }));
  }, []);

  const sendCommand = useCallback((text: string) => {
    const cmd: UserCommand = { text, timestamp: new Date().toISOString() };
    setCommandHistory((prev) => [...prev, cmd]);
  }, []);

  const sendRating = useCallback((iterationId: number, rating: number) => {
    setState((prev) => ({
      ...prev,
      iterations: prev.iterations.map((it) =>
        it.id === iterationId ? { ...it, human_rating: rating } : it
      ),
    }));
  }, []);

  return {
    state,
    connected,
    sendCommand,
    sendRating,
    commandHistory,
    toggleSimulation,
    isSimulating,
    scramble,
    registerCapture,
    rlMetrics,
  };
}
