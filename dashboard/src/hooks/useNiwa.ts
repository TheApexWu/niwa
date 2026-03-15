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
        block_color: (raw.move?.block_color as 'pink' | 'green' | 'blue') || 'pink',
        block_id: String(raw.move?.block_id ?? 0),
        from_position: raw.move?.from_position ?? 0,
        to_position: raw.move?.to_position ?? 0,
        orientation: (raw.move?.orientation as 'flat') || 'flat',
      },
      reasoning: raw.critic_suggestion,
      artist_feedback: raw.critic_comparison || '',
    },
    artist: {
      instinct: raw.artist_instinct,
      move: {
        block_color: (raw.move?.block_color as 'pink' | 'green' | 'blue') || 'pink',
        block_id: String(raw.move?.block_id ?? 0),
        from_position: raw.move?.from_position ?? 0,
        to_position: raw.move?.to_position ?? 0,
        orientation: (raw.move?.orientation as 'flat') || 'flat',
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
  const [rlMetrics] = useState<RLTrainingMetrics | null>(null);
  const captureFrameFnRef = useRef<(() => string | null) | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastDataLengthRef = useRef(0);

  const registerCapture = useCallback((fn: () => string | null) => {
    captureFrameFnRef.current = fn;
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
      }
    } catch {
      // Backend not available, keep current state (mock or last known)
    }
  }, []);

  // Toggle polling simulation
  const toggleSimulation = useCallback(() => {
    setIsSimulating((prev) => {
      const next = !prev;
      if (next) {
        // Start polling
        pollData(); // immediate first poll
        pollIntervalRef.current = setInterval(pollData, POLL_INTERVAL);
      } else {
        // Stop polling
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        setState((prev) => ({ ...prev, status: 'paused' }));
      }
      return next;
    });
  }, [pollData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

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
            priority: 'RECOVERY MODE: Arrangement scrambled. Rebuilding from chaos.',
            scores: Object.fromEntries(
              prev.active_dimensions.map((d) => [d, Math.floor(Math.random() * 20) + 10]),
            ),
            suggestion: { block_color: 'pink', block_id: 'scramble', from_position: 0, to_position: 4, orientation: 'flat' },
            reasoning: 'Chaos detected. Falling back to learned priorities.',
            artist_feedback: 'System disrupted. Activating recovery.',
          },
          artist: {
            instinct: 'Scramble detected. Trusting learned instincts.',
            move: { block_color: 'pink', block_id: 'scramble', from_position: 0, to_position: 4, orientation: 'on-side' },
            predicted_delta: 8,
            followed_critic: false,
            rejection_reasoning: 'Even in recovery, I trust my learned orientation preferences.',
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
