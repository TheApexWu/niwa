import { Crosshair } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { Panel } from '../ui/Panel';
import type { NiwaState } from '../../types/niwa';

interface PredictionChartProps {
  state: NiwaState;
}

export function PredictionChart({ state }: PredictionChartProps) {
  const data = state.iterations.map((iter) => ({
    iteration: iter.id,
    predicted: iter.artist.predicted_delta,
    actual: iter.actual_delta,
    error: Math.abs(iter.artist.predicted_delta - iter.actual_delta),
    followed: iter.artist.followed_critic,
  }));

  const recentErrors = data.slice(-5).map(d => d.error);
  const avgRecent = recentErrors.length ? recentErrors.reduce((a, b) => a + b, 0) / recentErrors.length : 0;

  return (
    <Panel
      title="Predicted vs Actual Delta"
      icon={<Crosshair size={14} className="text-niwa-artist" />}
    >
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(52, 211, 153, 0.08)" />
            <XAxis dataKey="iteration" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={{ stroke: 'rgba(52, 211, 153, 0.1)' }} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={{ stroke: 'rgba(52, 211, 153, 0.1)' }} tickLine={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(16, 16, 24, 0.9)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(52, 211, 153, 0.15)',
                borderRadius: '12px',
                fontSize: '11px',
                color: '#e2e8f0',
              }}
              itemStyle={{ color: '#e2e8f0' }}
              labelStyle={{ color: '#94a3b8' }}
            />
            <ReferenceLine y={0} stroke="rgba(52, 211, 153, 0.1)" />
            <Bar dataKey="predicted" name="Predicted" radius={[2, 2, 0, 0]} maxBarSize={20}>
              {data.map((_entry, i) => (
                <Cell key={i} fill="#06b6d4" fillOpacity={0.6} />
              ))}
            </Bar>
            <Bar dataKey="actual" name="Actual" radius={[2, 2, 0, 0]} maxBarSize={20}>
              {data.map((_entry, i) => (
                <Cell key={i} fill={_entry.followed ? '#10b981' : '#ef4444'} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-[10px]">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm bg-niwa-artist/60" />
          <span className="text-niwa-text-muted">Predicted</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm bg-niwa-positive/80" />
          <span className="text-niwa-text-muted">Actual (followed)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm bg-niwa-negative/80" />
          <span className="text-niwa-text-muted">Actual (rejected)</span>
        </div>
        <div className="flex items-center gap-1 text-niwa-text-dim">
          <span>Avg error:</span>
          <span className={`font-mono font-bold ${avgRecent <= 1 ? 'text-niwa-positive' : 'text-niwa-critic'}`}>{avgRecent.toFixed(1)}</span>
        </div>
      </div>
    </Panel>
  );
}
