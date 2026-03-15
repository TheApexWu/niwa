import { useState, useRef, useEffect } from 'react';
import { Send, Terminal, MessageCircle } from 'lucide-react';
import type { UserCommand } from '../../types/niwa';

interface CommandInputProps {
  onSend: (text: string) => void;
  history: UserCommand[];
}

export function CommandInput({ onSend, history }: CommandInputProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [history.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSend(input.trim());
    setInput('');
  };

  const quickCommands = [
    'Focus on color harmony',
    'Try vertical placements',
    'Reset to center',
    'More negative space',
  ];

  return (
    <div className="glass-card p-4 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <Terminal size={14} className="text-niwa-accent" />
        <h3 className="text-sm font-semibold text-niwa-text">Live Commands</h3>
        <span className="text-[10px] text-niwa-text-muted ml-auto">Judge interaction mode</span>
      </div>

      {history.length > 0 && (
        <div ref={historyRef} className="max-h-24 overflow-y-auto mb-3 space-y-1.5">
          {history.map((cmd, i) => (
            <div key={i} className="flex items-start gap-2 animate-fade-in">
              <MessageCircle size={10} className="text-niwa-accent mt-0.5 shrink-0" />
              <div>
                <p className="text-[11px] text-niwa-text-dim">{cmd.text}</p>
                <p className="text-[9px] text-niwa-text-muted">
                  {new Date(cmd.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Natural language instruction for the system..."
          className="flex-1 bg-niwa-bg border border-niwa-border rounded-lg px-3 py-2 text-xs text-niwa-text placeholder:text-niwa-text-muted focus:outline-none focus:border-niwa-accent transition-colors"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="px-3 py-2 bg-niwa-accent rounded-lg text-white text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-niwa-accent-dim transition-colors"
        >
          <Send size={12} />
        </button>
      </form>

      <div className="flex flex-wrap gap-1.5 mt-2">
        {quickCommands.map(cmd => (
          <button
            key={cmd}
            onClick={() => { onSend(cmd); }}
            className="text-[9px] px-2 py-1 rounded-full bg-niwa-surface-2/50 border border-niwa-border/50 text-niwa-text-dim hover:text-niwa-text hover:border-niwa-accent/50 transition-colors"
          >
            {cmd}
          </button>
        ))}
      </div>
    </div>
  );
}
