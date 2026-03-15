import { MessageSquare, Eye, Brain, ThumbsUp, ThumbsDown } from 'lucide-react';
import { Panel } from '../ui/Panel';
import type { NiwaState, Iteration } from '../../types/niwa';
import { useRef, useEffect } from 'react';

interface DebateLogProps {
  state: NiwaState;
}

function IterationEntry({ iter, isLatest }: { iter: Iteration; isLatest: boolean }) {
  return (
    <div className={`relative pl-4 pb-4 border-l-2 ${isLatest ? 'border-niwa-accent' : 'border-niwa-border/50'} ${isLatest ? 'animate-fade-in' : ''}`}>
      <div className={`absolute -left-[7px] top-0 w-3 h-3 rounded-full border-2 ${isLatest ? 'bg-niwa-accent border-niwa-accent' : 'bg-niwa-surface border-niwa-border'}`} />

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-niwa-text-muted">#{iter.id}</span>
          <span className="text-[10px] text-niwa-text-muted">
            Score {iter.overall_score} ({iter.actual_delta >= 0 ? '+' : ''}{iter.actual_delta})
          </span>
          {iter.priority_changed && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-niwa-critic/20 text-niwa-critic font-medium">PRIORITY SHIFT</span>
          )}
          {iter.instinct_changed && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-niwa-artist/20 text-niwa-artist font-medium">INSTINCT EVOLVED</span>
          )}
        </div>

        {/* Critic */}
        <div className="bg-niwa-surface-2/40 rounded-lg p-2.5 border border-niwa-border/30">
          <div className="flex items-center gap-1.5 mb-1">
            <Eye size={10} className="text-niwa-critic" />
            <span className="text-[10px] font-bold text-niwa-critic uppercase tracking-wider">Critic</span>
          </div>
          <p className="text-[11px] text-niwa-text-dim leading-relaxed">{iter.critic.priority}</p>
          <p className="text-[10px] text-niwa-text-muted mt-1 italic">{iter.critic.reasoning}</p>
        </div>

        {/* Artist */}
        <div className="bg-niwa-surface-2/40 rounded-lg p-2.5 border border-niwa-border/30">
          <div className="flex items-center gap-1.5 mb-1">
            <Brain size={10} className="text-niwa-artist" />
            <span className="text-[10px] font-bold text-niwa-artist uppercase tracking-wider">Artist</span>
            {iter.artist.followed_critic ? (
              <ThumbsUp size={10} className="text-niwa-positive ml-auto" />
            ) : (
              <ThumbsDown size={10} className="text-niwa-negative ml-auto" />
            )}
            <span className={`text-[9px] ${iter.artist.followed_critic ? 'text-niwa-positive' : 'text-niwa-negative'}`}>
              {iter.artist.followed_critic ? 'Followed' : 'Rejected'}
            </span>
          </div>
          <p className="text-[11px] text-niwa-text-dim leading-relaxed">{iter.artist.instinct}</p>
          {iter.artist.rejection_reasoning && (
            <p className="text-[10px] text-niwa-negative/80 mt-1 italic">Rejection: {iter.artist.rejection_reasoning}</p>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[9px] text-niwa-text-muted">
              Predicted: {iter.artist.predicted_delta >= 0 ? '+' : ''}{iter.artist.predicted_delta}
            </span>
            <span className="text-[9px] text-niwa-text-muted">
              Actual: {iter.actual_delta >= 0 ? '+' : ''}{iter.actual_delta}
            </span>
            <span className={`text-[9px] font-mono font-bold ${Math.abs(iter.artist.predicted_delta - iter.actual_delta) <= 1 ? 'text-niwa-positive' : 'text-niwa-critic'}`}>
              Error: {Math.abs(iter.artist.predicted_delta - iter.actual_delta)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DebateLog({ state }: DebateLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current?.parentElement;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [state.iterations.length]);

  return (
    <Panel
      title="Debate Log"
      icon={<MessageSquare size={14} className="text-niwa-accent" />}
      badge={`${state.iterations.filter(i => !i.artist.followed_critic).length} rejections`}
      badgeColor="bg-niwa-negative/80"
    >
      <div ref={scrollRef} className="space-y-0 ml-2">
        {state.iterations.map((iter, i) => (
          <IterationEntry key={iter.id} iter={iter} isLatest={i === state.iterations.length - 1} />
        ))}
      </div>
    </Panel>
  );
}
