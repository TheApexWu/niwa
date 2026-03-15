import { Target } from 'lucide-react';
import { Radar, RadarChart as RechartsRadar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Legend } from 'recharts';
import { Panel } from '../ui/Panel';
import type { NiwaState } from '../../types/niwa';

interface RadarChartProps {
  state: NiwaState;
}

export function RadarChartPanel({ state }: RadarChartProps) {
  const latest = state.iterations[state.iterations.length - 1];
  const first = state.iterations[0];
  if (!latest || !first) return null;

  const data = state.active_dimensions.filter(d => d !== 'overall').map(dim => ({
    dimension: dim.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
    current: latest.dimension_scores[dim] || 0,
    initial: first.dimension_scores[dim] || 0,
  }));

  return (
    <Panel
      title="Dimension Radar"
      icon={<Target size={14} className="text-niwa-accent" />}
      badge="6D"
      badgeColor="bg-niwa-accent/60"
    >
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <RechartsRadar data={data} cx="50%" cy="50%" outerRadius="70%">
            <PolarGrid stroke="rgba(52, 211, 153, 0.1)" />
            <PolarAngleAxis
              dataKey="dimension"
              tick={{ fontSize: 9, fill: '#94a3b8' }}
            />
            <PolarRadiusAxis
              domain={[0, 100]}
              tick={{ fontSize: 8, fill: '#64748b' }}
              axisLine={false}
            />
            <Radar
              name="Initial"
              dataKey="initial"
              stroke="#64748b"
              fill="#64748b"
              fillOpacity={0.1}
              strokeDasharray="3 3"
            />
            <Radar
              name="Current"
              dataKey="current"
              stroke="#10b981"
              fill="#10b981"
              fillOpacity={0.2}
              strokeWidth={2}
            />
            <Legend
              wrapperStyle={{ fontSize: '10px', color: '#94a3b8' }}
            />
          </RechartsRadar>
        </ResponsiveContainer>
      </div>

      {/* Priority drift indicators */}
      <div className="mt-2 space-y-1">
        <p className="text-[10px] text-niwa-text-muted font-medium uppercase tracking-wider">Priority Drift</p>
        <div className="flex flex-wrap gap-1.5">
          {state.active_dimensions.filter(d => d !== 'overall').map(dim => {
            const initial = state.initial_priorities[dim] || 0;
            const current = state.current_priorities[dim] || 0;
            const drift = current - initial;
            return (
              <div key={dim} className="flex items-center gap-1 bg-niwa-surface-2/50 rounded px-1.5 py-0.5 border border-niwa-border/50">
                <span className="text-[9px] text-niwa-text-dim capitalize">{dim.replace('_', ' ')}</span>
                <span className={`text-[9px] font-mono font-bold ${drift > 0 ? 'text-niwa-positive' : drift < 0 ? 'text-niwa-negative' : 'text-niwa-text-muted'}`}>
                  {drift > 0 ? '+' : ''}{drift}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}
