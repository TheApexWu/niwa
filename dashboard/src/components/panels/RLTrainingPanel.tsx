import { Brain, TrendingUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Panel } from '../ui/Panel';
import type { RLTrainingMetrics } from '../../types/niwa';

interface RLTrainingPanelProps {
  metrics: RLTrainingMetrics | null;
}

export function RLTrainingPanel({ metrics }: RLTrainingPanelProps) {
  const tooltipStyle = {
    backgroundColor: 'rgba(16, 16, 24, 0.9)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(52, 211, 153, 0.15)',
    borderRadius: '12px',
    fontSize: '10px',
    color: '#e2e8f0',
  };

  if (!metrics) {
    return (
      <Panel
        title="RL Training"
        icon={<Brain size={14} className="text-niwa-artist" />}
      >
        <div className="flex items-center justify-center h-32 text-niwa-text-muted text-xs">
          Waiting for backend connection...
        </div>
      </Panel>
    );
  }

  const windowSize = 5;
  const rewardData = metrics.reward_history.map((reward, i) => ({
    iteration: i + 1,
    reward: Number(reward.toFixed(3)),
  }));

  const rewardWithMA = rewardData.map((d, i) => {
    const start = Math.max(0, i - windowSize + 1);
    const window = rewardData.slice(start, i + 1);
    const avg = window.reduce((sum, w) => sum + w.reward, 0) / window.length;
    return { ...d, moving_avg: Number(avg.toFixed(3)) };
  });

  const ratingData = metrics.human_ratings.map((r) => ({
    iteration: r.iteration,
    rating: r.rating,
  }));

  return (
    <Panel
      title="RL Training"
      icon={<Brain size={14} className="text-niwa-artist" />}
      badge={`${metrics.total_episodes} episodes`}
      badgeColor="bg-niwa-artist/20"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-niwa-bg/50 rounded-lg p-2 text-center border border-niwa-border/20">
            <div className="text-[9px] text-niwa-text-muted uppercase">Avg Reward</div>
            <div className={`text-sm font-bold ${metrics.mean_reward_last_10 >= 0 ? 'text-niwa-positive' : 'text-niwa-negative'}`}>
              {metrics.mean_reward_last_10.toFixed(3)}
            </div>
          </div>
          <div className="bg-niwa-bg/50 rounded-lg p-2 text-center border border-niwa-border/20">
            <div className="text-[9px] text-niwa-text-muted uppercase">Entropy</div>
            <div className="text-sm font-bold text-niwa-accent">
              {metrics.policy_entropy.toFixed(2)}
            </div>
          </div>
          <div className="bg-niwa-bg/50 rounded-lg p-2 text-center border border-niwa-border/20">
            <div className="text-[9px] text-niwa-text-muted uppercase">Ratings</div>
            <div className="text-sm font-bold text-yellow-400">
              {metrics.human_ratings.length}
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-[10px] font-bold text-niwa-text uppercase tracking-wider mb-2 flex items-center gap-1">
            <TrendingUp size={10} />
            Reward Curve
          </h4>
          <div className="h-28">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rewardWithMA} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(52, 211, 153, 0.08)" />
                <XAxis dataKey="iteration" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={{ stroke: 'rgba(52, 211, 153, 0.1)' }} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#64748b' }} axisLine={{ stroke: 'rgba(52, 211, 153, 0.1)' }} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="reward" name="Reward" stroke="#06b6d4" strokeWidth={1} dot={{ fill: '#06b6d4', r: 2 }} opacity={0.5} />
                <Line type="monotone" dataKey="moving_avg" name="Moving Avg" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {ratingData.length > 0 && (
          <div>
            <h4 className="text-[10px] font-bold text-niwa-text uppercase tracking-wider mb-2">Human Ratings</h4>
            <div className="h-20">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ratingData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(52, 211, 153, 0.08)" />
                  <XAxis dataKey="iteration" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={{ stroke: 'rgba(52, 211, 153, 0.1)' }} tickLine={false} />
                  <YAxis domain={[0, 5]} tick={{ fontSize: 9, fill: '#64748b' }} axisLine={{ stroke: 'rgba(52, 211, 153, 0.1)' }} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="rating" name="Rating" fill="#facc15" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div>
          <h4 className="text-[10px] font-bold text-niwa-text uppercase tracking-wider mb-1">Policy Confidence</h4>
          <div className="h-2 bg-niwa-bg rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-niwa-artist to-niwa-positive rounded-full transition-all duration-500"
              style={{ width: `${Math.max(5, (1 - metrics.policy_entropy) * 100)}%` }}
            />
          </div>
          <div className="flex justify-between mt-0.5">
            <span className="text-[8px] text-niwa-text-muted">Exploring</span>
            <span className="text-[8px] text-niwa-text-muted">Confident</span>
          </div>
        </div>
      </div>
    </Panel>
  );
}
