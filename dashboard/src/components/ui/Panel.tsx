import { type ReactNode, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

interface PanelProps {
  title: string;
  icon?: ReactNode;
  badge?: string;
  badgeColor?: string;
  children: ReactNode;
  className?: string;
  expandable?: boolean;
  glowClass?: string;
  fullscreenExpand?: boolean;
  headerActions?: ReactNode;
}

export function Panel({ title, icon, badge, badgeColor = 'bg-niwa-accent', children, className = '', expandable = true, glowClass, fullscreenExpand = false, headerActions }: PanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (expanded && fullscreenExpand) {
    return (
      <div className="fixed inset-0 z-50 bg-black animate-fade-in">
        <div className="relative w-full h-full" data-panel-fullscreen>
          {children}
          <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
            {headerActions}
            <button
              onClick={() => setExpanded(false)}
              className="p-2 bg-black/60 backdrop-blur-sm hover:bg-black/80 rounded-lg transition-colors"
            >
              <Minimize2 size={18} className="text-white/80" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (expanded) {
    return (
      <div className="fixed inset-0 z-50 bg-niwa-bg/95 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
        <div className={`w-full max-w-6xl max-h-[90vh] overflow-auto glass-card p-6 ${glowClass || ''}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              {icon}
              <h3 className="text-lg font-semibold text-niwa-text">{title}</h3>
              {badge && <span className={`text-xs px-2 py-0.5 rounded-full ${badgeColor} text-white font-medium`}>{badge}</span>}
            </div>
            <button onClick={() => setExpanded(false)} className="p-2 hover:bg-niwa-surface-2 rounded-lg transition-colors">
              <Minimize2 size={16} className="text-niwa-text-dim" />
            </button>
          </div>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className={`glass-card pt-4 pl-4 pb-2 pr-0 h-full flex flex-col ${glowClass || ''} ${className}`}>
      <div className="flex items-center justify-between mb-3 shrink-0 pr-4">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-sm font-semibold text-niwa-text">{title}</h3>
          {badge && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${badgeColor} text-white font-medium`}>{badge}</span>}
        </div>
        <div className="flex items-center gap-1">
          {headerActions}
          {expandable && (
            <button onClick={() => setExpanded(true)} className="p-1.5 hover:bg-niwa-surface-2 rounded-lg transition-colors">
              <Maximize2 size={12} className="text-niwa-text-muted" />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 flex flex-col overflow-auto min-h-0 pr-4">
        {children}
      </div>
    </div>
  );
}
