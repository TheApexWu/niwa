import { Wifi, WifiOff, Play, Pause, Shuffle, Bot } from 'lucide-react';
import type { NiwaState } from '../../types/niwa';

interface StatusBarProps {
  state: NiwaState;
  connected: boolean;
  isSimulating: boolean;
  onToggleSimulation: () => void;
  onScramble: () => void;
}

export function StatusBar({ state, connected, isSimulating, onToggleSimulation, onScramble }: StatusBarProps) {
  const statusColor = {
    idle: 'text-niwa-text-muted',
    running: 'text-niwa-positive',
    paused: 'text-niwa-critic',
    recovery: 'text-niwa-negative',
  }[state.status];

  return (
    <header className="glass-card !rounded-none !border-x-0 !border-t-0 px-6 py-3">
      <div className="flex items-center justify-between">
        {/* Left: Logo + Status */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-niwa-accent to-niwa-accent-dim flex items-center justify-center glow-accent">
              <span className="text-white font-bold text-sm">N</span>
            </div>
            <div>
              <h1 className="text-sm font-bold text-niwa-text tracking-tight">NIWA</h1>
              <p className="text-[10px] text-niwa-text-muted leading-none">Jenga Strategy</p>
            </div>
          </div>
          <div className="h-6 w-px bg-niwa-border" />
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${state.status === 'running' ? 'bg-niwa-positive animate-pulse-live' : state.status === 'recovery' ? 'bg-niwa-negative animate-pulse-live' : 'bg-niwa-text-muted'}`} />
            <span className={`text-xs font-medium ${statusColor} uppercase tracking-wider`}>{state.status}</span>
            <span className="text-xs text-niwa-text-muted">|</span>
            <span className="text-xs text-niwa-text-dim">Iteration {state.current_iteration}</span>
          </div>
        </div>

        {/* Center: System info */}
        <div className="flex items-center gap-4 text-[10px] text-niwa-text-muted">
          <div className="flex items-center gap-1">
            <Bot size={10} />
            <span className={state.robot_status === 'connected' || state.robot_status === 'idle' ? 'text-niwa-positive' : state.robot_status === 'moving' ? 'text-niwa-artist' : 'text-niwa-negative'}>
              SO-101 {state.robot_status}
            </span>
          </div>
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 mr-2">
            {connected ? <Wifi size={14} className="text-niwa-positive" /> : <WifiOff size={14} className="text-niwa-text-muted" />}
            <span className="text-[10px] text-niwa-text-muted">{connected ? 'Live' : 'Mock'}</span>
          </div>
          <button
            onClick={onToggleSimulation}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isSimulating
                ? 'bg-niwa-critic/20 text-niwa-critic border border-niwa-critic/30'
                : 'bg-niwa-positive/20 text-niwa-positive border border-niwa-positive/30'
            }`}
          >
            {isSimulating ? <Pause size={12} /> : <Play size={12} />}
            {isSimulating ? 'Pause' : 'Run'}
          </button>
          <button
            onClick={onScramble}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-niwa-negative/20 text-niwa-negative border border-niwa-negative/30 transition-all hover:bg-niwa-negative/30"
          >
            <Shuffle size={12} />
            Scramble
          </button>
        </div>
      </div>
    </header>
  );
}
