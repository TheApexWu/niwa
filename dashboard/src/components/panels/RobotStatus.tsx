import { Cpu, Wifi, Activity, Gauge, Disc, Zap } from 'lucide-react';
import { Panel } from '../ui/Panel';
import type { NiwaState, SO101JointName } from '../../types/niwa';
import { SO101_JOINTS } from '../../types/niwa';

interface RobotStatusProps {
  state: NiwaState;
}

const JOINT_LABELS: Record<SO101JointName, string> = {
  shoulder_pan: 'Shoulder Pan',
  shoulder_lift: 'Shoulder Lift',
  elbow_flex: 'Elbow Flex',
  wrist_flex: 'Wrist Flex',
  wrist_roll: 'Wrist Roll',
  gripper: 'Gripper',
};

const JOINT_RANGES: Record<SO101JointName, [number, number]> = {
  shoulder_pan: [-180, 180],
  shoulder_lift: [-90, 90],
  elbow_flex: [-150, 150],
  wrist_flex: [-90, 90],
  wrist_roll: [-180, 180],
  gripper: [0, 100],
};

export function RobotStatus({ state }: RobotStatusProps) {
  const hw = state.robot_hardware;
  const grpcState = hw?.connection || 'disconnected';

  const grpcColor = {
    disconnected: 'text-niwa-text-muted',
    connecting: 'text-niwa-critic',
    handshake: 'text-niwa-artist',
    streaming: 'text-niwa-positive',
    error: 'text-niwa-negative',
  }[grpcState];

  return (
    <Panel
      title="SO-101 Robot"
      icon={<Cpu size={14} className="text-niwa-accent" />}
      badge={grpcState.toUpperCase()}
      badgeColor={grpcState === 'streaming' ? 'bg-niwa-positive/80' : grpcState === 'error' ? 'bg-niwa-negative/80' : 'bg-niwa-text-muted/60'}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-niwa-surface-2/40 rounded-lg p-2 border border-niwa-border/30">
            <div className="flex items-center gap-1.5 mb-1">
              <Wifi size={10} className={grpcColor} />
              <span className="text-[9px] text-niwa-text-muted uppercase tracking-wider">gRPC Link</span>
            </div>
            <p className={`text-xs font-mono font-bold ${grpcColor}`}>{grpcState}</p>
            {hw && (
              <p className="text-[9px] text-niwa-text-muted mt-0.5">
                Latency: {state.iterations[state.iterations.length - 1]?.robot_execution?.network_latency_ms?.toFixed(0) || '\u2014'}ms
              </p>
            )}
          </div>
          <div className="bg-niwa-surface-2/40 rounded-lg p-2 border border-niwa-border/30">
            <div className="flex items-center gap-1.5 mb-1">
              <Activity size={10} className="text-niwa-artist" />
              <span className="text-[9px] text-niwa-text-muted uppercase tracking-wider">Control Loop</span>
            </div>
            <p className="text-xs font-mono font-bold text-niwa-text">
              {hw?.fps_actual?.toFixed(0) || '\u2014'} / {hw?.fps_target || 30} Hz
            </p>
            <p className="text-[9px] text-niwa-text-muted mt-0.5">
              Queue: {hw?.action_queue_size || 0} / {hw?.action_chunk_size || '\u2014'}
            </p>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Gauge size={10} className="text-niwa-accent" />
            <span className="text-[9px] text-niwa-text-muted uppercase tracking-wider font-medium">
              Joint Positions (6-DOF STS3215)
            </span>
          </div>
          <div className="space-y-1.5">
            {SO101_JOINTS.map(joint => {
              const posKey = `${joint}.pos`;
              const currentPos = hw?.joint_positions?.[posKey] ?? 0;
              const targetPos = hw?.joint_targets?.[posKey];
              const [min, max] = JOINT_RANGES[joint];
              const range = max - min;
              const normalizedCurrent = ((currentPos - min) / range) * 100;
              const normalizedTarget = targetPos !== undefined ? ((targetPos - min) / range) * 100 : undefined;
              const isGripper = joint === 'gripper';

              return (
                <div key={joint} className="flex items-center gap-2">
                  <span className="text-[9px] text-niwa-text-dim w-20 truncate">{JOINT_LABELS[joint]}</span>
                  <div className="flex-1 h-2 bg-niwa-bg rounded-full overflow-hidden relative">
                    <div
                      className={`absolute inset-y-0 rounded-full transition-all duration-300 ${isGripper ? 'bg-niwa-positive' : 'bg-niwa-accent'}`}
                      style={{ left: `${Math.max(0, Math.min(100, normalizedCurrent))}%`, width: '3px' }}
                    />
                    {normalizedTarget !== undefined && (
                      <div
                        className="absolute inset-y-0 bg-niwa-critic/60 rounded-full"
                        style={{ left: `${Math.max(0, Math.min(100, normalizedTarget))}%`, width: '2px' }}
                      />
                    )}
                    {!isGripper && (
                      <div className="absolute inset-y-0 left-1/2 w-px bg-niwa-border" />
                    )}
                  </div>
                  <span className="text-[9px] font-mono text-niwa-text-dim w-12 text-right">
                    {currentPos.toFixed(1)}°
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between text-[10px] bg-niwa-surface-2/40 rounded-lg p-2 border border-niwa-border/30">
          <div className="flex items-center gap-1.5">
            <Disc size={10} className="text-niwa-artist" />
            <span className="text-niwa-text-muted">Trajectories</span>
            <span className="font-mono text-niwa-text">{hw?.trajectories_loaded || 0} loaded</span>
          </div>
          {hw?.current_trajectory && (
            <div className="flex items-center gap-1">
              <Zap size={8} className="text-niwa-critic animate-pulse-live" />
              <span className="text-niwa-critic font-mono">{hw.current_trajectory}</span>
            </div>
          )}
        </div>

        {state.policy_server && (
          <div className="text-[9px] text-niwa-text-muted bg-niwa-bg/50 rounded-lg p-2 font-mono border border-niwa-border/20">
            <p>PolicyServer: {state.policy_server.host}:{state.policy_server.port}</p>
            <p>FPS: {state.policy_server.fps} | Latency target: {(state.policy_server.inference_latency * 1000).toFixed(0)}ms</p>
            <p>Nebius GPU &rarr; gRPC &rarr; SO-101 local</p>
          </div>
        )}
      </div>
    </Panel>
  );
}
