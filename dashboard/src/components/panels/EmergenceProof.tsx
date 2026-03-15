import { Sparkles, ArrowRight } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Panel } from '../ui/Panel';
import type { NiwaState } from '../../types/niwa';

interface EmergenceProofProps {
  state: NiwaState;
}

export function EmergenceProof({ state }: EmergenceProofProps) {
  const priorityDriftEntries = state.active_dimensions.filter(d => d !== 'overall').map(dim => {
    const initial = state.initial_priorities[dim] || 0;
    const current = state.current_priorities[dim] || 0;
    return { dimension: dim, initial, current, drift: current - initial };
  }).sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));

  const predAccData = state.prediction_accuracy.map((err, i) => ({
    iteration: i + 1,
    error: err,
  }));

  const rejectData = state.iterations.map((iter, i) => {
    const slice = state.iterations.slice(0, i + 1);
    const rejectDeltas = slice.filter(x => !x.artist.followed_critic).map(x => x.actual_delta);
    const followDeltas = slice.filter(x => x.artist.followed_critic).map(x => x.actual_delta);
    const avgRejectDelta = rejectDeltas.length ? rejectDeltas.reduce((a, b) => a + b, 0) / rejectDeltas.length : 0;
    const avgFollowDelta = followDeltas.length ? followDeltas.reduce((a, b) => a + b, 0) / followDeltas.length : 0;
    return {
      iteration: iter.id,
      avg_reject_delta: Number(avgRejectDelta.toFixed(1)),
      avg_follow_delta: Number(avgFollowDelta.toFixed(1)),
    };
  });

  const priorityShifts = state.iterations.filter(i => i.priority_changed).map(i => ({ id: i.id, priority: i.critic.priority }));
  const instinctShifts = state.iterations.filter(i => i.instinct_changed).map(i => ({ id: i.id, instinct: i.artist.instinct }));

  const tooltipStyle = {
    backgroundColor: 'rgba(16, 16, 24, 0.9)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(52, 211, 153, 0.15)',
    borderRadius: '12px',
    fontSize: '10px',
    color: '#e2e8f0',
  };

  return (
    <Panel
      title="Emergence Proof"
      icon={<Sparkles size={14} className="text-niwa-accent" />}
      glowClass="glow-accent"
    >
      <div className="space-y-4">
        {/* 1. Priority Drift */}
        <div>
          <h4 className="text-[10px] font-bold text-niwa-text uppercase tracking-wider mb-2">1. Priority Drift (Strongest Evidence)</h4>
          <div className="space-y-1.5">
            {priorityDriftEntries.map(entry => (
              <div key={entry.dimension} className="grid grid-cols-[5.5rem_1.5rem_1fr_1.5rem_0.75rem_2rem] items-center gap-1.5">
                <span className="text-[10px] text-niwa-text-dim capitalize truncate">{entry.dimension.replace('_', ' ')}</span>
                <span className="text-[9px] font-mono text-niwa-text-muted text-right">{entry.initial}</span>
                <div className="h-2 bg-niwa-bg rounded-full overflow-hidden relative">
                  <div className="absolute inset-y-0 left-0 bg-niwa-text-muted/20 rounded-full" style={{ width: `${entry.initial}%` }} />
                  <div className={`absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ${entry.drift > 0 ? 'bg-niwa-positive' : 'bg-niwa-negative'}`} style={{ width: `${entry.current}%` }} />
                </div>
                <span className="text-[9px] font-mono text-niwa-text text-left">{entry.current}</span>
                <ArrowRight size={8} className="text-niwa-text-muted" />
                <span className={`text-[9px] font-mono font-bold text-right ${entry.drift > 0 ? 'text-niwa-positive' : entry.drift < 0 ? 'text-niwa-negative' : 'text-niwa-text-muted'}`}>
                  {entry.drift > 0 ? '+' : ''}{entry.drift}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 2. Prediction Accuracy */}
        <div>
          <h4 className="text-[10px] font-bold text-niwa-text uppercase tracking-wider mb-2">2. Mutual Understanding (Prediction Accuracy)</h4>
          <div className="h-28">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={predAccData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(52, 211, 153, 0.08)" />
                <XAxis dataKey="iteration" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={{ stroke: 'rgba(52, 211, 153, 0.1)' }} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#64748b' }} axisLine={{ stroke: 'rgba(52, 211, 153, 0.1)' }} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="error" name="Prediction Error" stroke="#06b6d4" strokeWidth={2} dot={{ fill: '#06b6d4', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[9px] text-niwa-text-muted mt-1 italic">Error gap closing = Artist built a model of Critic's taste</p>
        </div>

        {/* 3. Disagreement Learning */}
        <div>
          <h4 className="text-[10px] font-bold text-niwa-text uppercase tracking-wider mb-2">3. Disagreement Learning</h4>
          <div className="h-28">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rejectData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(52, 211, 153, 0.08)" />
                <XAxis dataKey="iteration" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={{ stroke: 'rgba(52, 211, 153, 0.1)' }} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#64748b' }} axisLine={{ stroke: 'rgba(52, 211, 153, 0.1)' }} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="avg_reject_delta" name="Avg Rejection Delta" stroke="#ef4444" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="avg_follow_delta" name="Avg Follow Delta" stroke="#10b981" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[9px] text-niwa-text-muted mt-1 italic">Rejections improving = Artist learns when to say no</p>
        </div>

        {/* 4. Shift Timeline */}
        <div>
          <h4 className="text-[10px] font-bold text-niwa-text uppercase tracking-wider mb-2">4. Shift Timeline</h4>
          <div className="space-y-2">
            {priorityShifts.map(s => (
              <div key={`p-${s.id}`} className="flex items-start gap-2 text-[10px]">
                <span className="text-niwa-critic font-mono shrink-0">#{s.id}</span>
                <span className="text-niwa-text-dim">{s.priority}</span>
              </div>
            ))}
            {instinctShifts.map(s => (
              <div key={`i-${s.id}`} className="flex items-start gap-2 text-[10px]">
                <span className="text-niwa-artist font-mono shrink-0">#{s.id}</span>
                <span className="text-niwa-text-dim">{s.instinct}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}
