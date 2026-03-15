import { useState, useRef, useEffect } from 'react';
import { Eye, Brain, LayoutGrid } from 'lucide-react';
import { useNiwa } from './hooks/useNiwa';
import { StatusBar } from './components/ui/StatusBar';
import { CameraFeed, type CameraFeedHandle } from './components/panels/CameraFeed';
import { ScoreTimeline } from './components/panels/ScoreTimeline';
import { RadarChartPanel } from './components/panels/RadarChart';
import { DebateLog } from './components/panels/DebateLog';
import { PredictionChart } from './components/panels/PredictionChart';
import { CommandInput } from './components/panels/CommandInput';
import { EmergenceProof } from './components/panels/EmergenceProof';
import { RobotStatus } from './components/panels/RobotStatus';
import { RLTrainingPanel } from './components/panels/RLTrainingPanel';
import { HumanRating } from './components/panels/HumanRating';
import type { ViewMode } from './types/niwa';

interface PanelSlot {
  id: string;
  colSpan: number;
}

const DEFAULT_OVERVIEW: PanelSlot[][] = [
  [{ id: 'camera', colSpan: 5 }, { id: 'timeline', colSpan: 7 }],
  [{ id: 'radar', colSpan: 3 }, { id: 'debate', colSpan: 3 }, { id: 'prediction', colSpan: 3 }, { id: 'rl', colSpan: 3 }],
  [{ id: 'emergence', colSpan: 3 }, { id: 'robot', colSpan: 3 }, { id: 'rating', colSpan: 3 }, { id: 'commands', colSpan: 3 }],
];

const ROW_HEIGHTS = ['h-[374px]', 'h-[330px]', 'h-[330px]'];

const STORAGE_KEY = 'niwa-layout-overview';

function loadLayout(): PanelSlot[][] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length === 3) return parsed;
    }
  } catch { /* ignore */ }
  return DEFAULT_OVERVIEW.map(row => row.map(s => ({ ...s })));
}

function App() {
  const { state, connected, sendCommand, sendRating, commandHistory, toggleSimulation, isSimulating, scramble, registerCapture, rlMetrics } = useNiwa();
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const cameraRef = useRef<CameraFeedHandle>(null);
  const [layout] = useState<PanelSlot[][]>(loadLayout);

  useEffect(() => {
    registerCapture(() => cameraRef.current?.captureFrame() ?? null);
  }, [registerCapture]);


  const renderPanel = (id: string) => {
    switch (id) {
      case 'camera':
        return <CameraFeed ref={cameraRef} state={state} viewMode={viewMode} />;
      case 'timeline':
        return <ScoreTimeline state={state} />;
      case 'radar':
        return <RadarChartPanel state={state} />;
      case 'debate':
        return <DebateLog state={state} />;
      case 'prediction':
        return <PredictionChart state={state} />;
      case 'rl':
        return <RLTrainingPanel metrics={rlMetrics} />;
      case 'emergence':
        return <EmergenceProof state={state} />;
      case 'robot':
        return <RobotStatus state={state} />;
      case 'rating':
        return (
          <HumanRating
            currentIteration={state.current_iteration}
            onRate={sendRating}
            lastRatedIteration={state.iterations.find(i => i.human_rating !== undefined && i.id === state.current_iteration)?.id}
          />
        );
      case 'commands':
        return <CommandInput onSend={sendCommand} history={commandHistory} />;
      default:
        return null;
    }
  };

  const viewModes: { key: ViewMode; label: string; icon: React.ReactNode; activeStyle: React.CSSProperties }[] = [
    {
      key: 'overview', label: 'Overview', icon: <LayoutGrid size={12} />,
      activeStyle: { backgroundColor: 'rgba(16, 185, 129, 0.2)', borderColor: 'rgba(16, 185, 129, 0.3)', color: '#10b981', border: '1px solid' },
    },
    {
      key: 'critic', label: 'Critic', icon: <Eye size={12} />,
      activeStyle: { backgroundColor: 'rgba(245, 158, 11, 0.2)', borderColor: 'rgba(245, 158, 11, 0.3)', color: '#f59e0b', border: '1px solid' },
    },
    {
      key: 'artist', label: 'Artist', icon: <Brain size={12} />,
      activeStyle: { backgroundColor: 'rgba(6, 182, 212, 0.2)', borderColor: 'rgba(6, 182, 212, 0.3)', color: '#06b6d4', border: '1px solid' },
    },
  ];

  return (
    <div className="min-h-screen bg-niwa-bg flex flex-col">
      <StatusBar
        state={state}
        connected={connected}
        isSimulating={isSimulating}
        onToggleSimulation={toggleSimulation}
        onScramble={scramble}
      />

      {/* View mode selector */}
      <div className="px-6 pt-4 pb-2 flex justify-center">
        <div className="flex items-center gap-1 glass-card !rounded-lg p-1 w-fit">
          {viewModes.map(mode => (
            <button
              key={mode.key}
              onClick={() => setViewMode(mode.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === mode.key
                  ? ''
                  : 'text-niwa-text-muted hover:text-niwa-text-dim'
              }`}
              style={viewMode === mode.key ? mode.activeStyle : {}}
            >
              {mode.icon}
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 px-6 pb-6">
        {viewMode === 'overview' && (
          <div className="space-y-4">
            {layout.map((row, rowIdx) => (
              <div key={rowIdx} className={`grid grid-cols-12 gap-4 ${ROW_HEIGHTS[rowIdx]}`}>
                {row.map((slot, colIdx) => (
                  <div
                    key={`${rowIdx}-${colIdx}`}
                    className="relative h-full overflow-hidden"
                    style={{ gridColumn: `span ${slot.colSpan} / span ${slot.colSpan}` }}
                  >
                    {renderPanel(slot.id)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {viewMode === 'critic' && (
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-8 space-y-4">
              <div className="h-[440px]">
                <CameraFeed ref={cameraRef} state={state} viewMode="critic" />
              </div>
              <div className="h-[374px]">
                <DebateLog state={state} />
              </div>
            </div>
            <div className="col-span-4 space-y-4">
              <div className="h-[264px]"><RadarChartPanel state={state} /></div>
              <div className="h-[264px]"><ScoreTimeline state={state} /></div>
              <div className="h-[264px]"><CommandInput onSend={sendCommand} history={commandHistory} /></div>
            </div>
          </div>
        )}

        {viewMode === 'artist' && (
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-8 space-y-4">
              <div className="h-[440px]">
                <CameraFeed ref={cameraRef} state={state} viewMode="artist" />
              </div>
              <div className="h-[374px]">
                <EmergenceProof state={state} />
              </div>
            </div>
            <div className="col-span-4 space-y-4">
              <div className="h-[264px]"><PredictionChart state={state} /></div>
              <div className="h-[264px]"><DebateLog state={state} /></div>
              <div className="h-[264px]"><CommandInput onSend={sendCommand} history={commandHistory} /></div>
            </div>
          </div>
        )}
      </main>


      <footer className="glass-card !rounded-none !border-x-0 !border-b-0 px-6 py-2 flex items-center justify-between text-[10px] text-niwa-text-muted">
        <span>NIWA v1.0 &bull; Nebius.Build SF 2026 &bull; Physical AI &gt; Vision-Language Agents</span>
        <span>Nebius Token Factory + Serverless</span>
      </footer>
    </div>
  );
}

export default App;
