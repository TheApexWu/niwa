import { TrendingUp } from 'lucide-react';
import { AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Panel } from '../ui/Panel';
import type { NiwaState } from '../../types/niwa';

interface ScoreTimelineProps {
  state: NiwaState;
}

export function ScoreTimeline({ state }: ScoreTimelineProps) {
  const data = state.iterations.map((iter) => ({
    iteration: iter.id,
    overall: iter.overall_score,
    stability: iter.dimension_scores.stability || 0,
    block_looseness: iter.dimension_scores.block_looseness || 0,
    risk_level: iter.dimension_scores.risk_level || 0,
    move_success: iter.dimension_scores.move_success || 0,
    rejected: !iter.artist.followed_critic,
  }));

  const dimensionColors: Record<string, string> = {
    overall: '#10b981',
    stability: '#f59e0b',
    block_looseness: '#06b6d4',
    risk_level: '#ef4444',
    move_success: '#22c55e',
  };

  return (
    <Panel
      title="Score Timeline"
      icon={<TrendingUp size={14} className="text-niwa-positive" />}
      badge={`${state.iterations.length} iter`}
      badgeColor="bg-niwa-accent/80"
    >
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="overallGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(52, 211, 153, 0.08)" />
            <XAxis
              dataKey="iteration"
              tick={{ fontSize: 10, fill: '#64748b' }}
              axisLine={{ stroke: 'rgba(52, 211, 153, 0.1)' }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: '#64748b' }}
              axisLine={{ stroke: 'rgba(52, 211, 153, 0.1)' }}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(16, 16, 24, 0.9)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(52, 211, 153, 0.15)',
                borderRadius: '12px',
                fontSize: '11px',
                color: '#e2e8f0',
              }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={((value: any, name: any) => [value, String(name).replace('_', ' ')]) as any}
            />
            {/* Rejection markers */}
            {data.filter(d => d.rejected).map(d => (
              <ReferenceLine key={d.iteration} x={d.iteration} stroke="#ef4444" strokeDasharray="2 2" strokeOpacity={0.4} />
            ))}
            {/* Dimension lines (ghost) */}
            {state.active_dimensions.filter(d => d !== 'overall').map(dim => (
              <Line
                key={dim}
                type="monotone"
                dataKey={dim}
                stroke={dimensionColors[dim] || '#64748b'}
                strokeWidth={1}
                dot={false}
                strokeOpacity={0.3}
              />
            ))}
            {/* Overall score — prominent area */}
            <Area
              type="monotone"
              dataKey="overall"
              stroke="#10b981"
              strokeWidth={2.5}
              fill="url(#overallGradient)"
              dot={{ fill: '#10b981', r: 3, stroke: '#10b981' }}
              activeDot={{ r: 5, fill: '#10b981', stroke: '#34d399', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-2 px-1">
        {Object.entries(dimensionColors).map(([key, color]) => (
          <div key={key} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color, opacity: key === 'overall' ? 1 : 0.5 }} />
            <span className="text-[9px] text-niwa-text-muted capitalize">{key.replace('_', ' ')}</span>
          </div>
        ))}
        <div className="flex items-center gap-1">
          <div className="w-3 h-px bg-niwa-negative" style={{ borderTop: '1px dashed #ef4444' }} />
          <span className="text-[9px] text-niwa-text-muted">rejection</span>
        </div>
      </div>
    </Panel>
  );
}
