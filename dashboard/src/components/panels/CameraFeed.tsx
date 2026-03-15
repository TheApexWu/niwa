import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import { Camera, Brain, Eye, SwitchCamera } from 'lucide-react';
import { Panel } from '../ui/Panel';
import type { NiwaState, ViewMode } from '../../types/niwa';

export interface CameraFeedHandle {
  captureFrame: () => string | null;
}

interface CameraFeedProps {
  state: NiwaState;
  viewMode: ViewMode;
}

export const CameraFeed = forwardRef<CameraFeedHandle, CameraFeedProps>(function CameraFeed({ state, viewMode }, ref) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Callback ref: reassign srcObject when video element is recreated (e.g. fullscreen toggle)
  const videoCallbackRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    if (node && streamRef.current) {
      node.srcObject = streamRef.current;
    }
  }, []);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [showDeviceMenu, setShowDeviceMenu] = useState(false);
  const deviceMenuRef = useRef<HTMLDivElement>(null);
  const showWebcam = !state.latest_image;

  // Enumerate video devices
  const refreshDevices = useCallback(async () => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices.filter(
        (d) => d.kind === 'videoinput' && d.deviceId && d.deviceId !== 'default'
      );
      const seen = new Set<string>();
      const filtered = videoDevices.filter((d) => {
        const label = (d.label || '').toLowerCase();
        if (label.includes('desk view')) return false;
        const key = d.label || d.deviceId;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setDevices(filtered);
      if (filtered.length > 0 && !filtered.find((d) => d.deviceId === selectedDeviceId)) {
        setSelectedDeviceId(filtered[0].deviceId);
      }
    } catch {
      // Ignore enumeration errors
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    refreshDevices();
    navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
  }, [refreshDevices]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (deviceMenuRef.current && !deviceMenuRef.current.contains(e.target as Node)) {
        setShowDeviceMenu(false);
      }
    };
    if (showDeviceMenu) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [showDeviceMenu]);

  useEffect(() => {
    if (!showWebcam) return;
    let cancelled = false;
    setCameraError(null);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    const videoConstraints = selectedDeviceId
      ? { deviceId: { exact: selectedDeviceId } }
      : true;

    navigator.mediaDevices
      .getUserMedia({ video: videoConstraints, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        refreshDevices();
      })
      .catch((err) => {
        if (!cancelled) setCameraError(err.message);
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [showWebcam, selectedDeviceId, refreshDevices]);

  useImperativeHandle(ref, () => ({
    captureFrame(): string | null {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return null;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      return dataUrl.split(',')[1] || null;
    },
  }));

  const latest = state.iterations[state.iterations.length - 1];
  const isCritic = viewMode === 'critic';
  const isArtist = viewMode === 'artist';
  const isOverview = viewMode === 'overview';

  const agentThoughts = isCritic
    ? { label: 'Critic', color: 'niwa-critic', priority: latest?.critic.priority, reasoning: latest?.critic.reasoning }
    : isArtist
    ? { label: 'Artist', color: 'niwa-artist', instinct: latest?.artist.instinct, reasoning: latest?.artist.rejection_reasoning || 'Following Critic suggestion.' }
    : isOverview && latest
    ? { label: 'Critic', color: 'niwa-critic', priority: latest.critic.priority, reasoning: latest.critic.reasoning, artistInstinct: latest.artist.instinct }
    : null;

  return (
    <Panel
      title="Live Feed"
      icon={<Camera size={14} className="text-niwa-accent" />}
      badge={state.status === 'running' ? 'LIVE' : undefined}
      badgeColor="bg-niwa-negative"
      glowClass={state.status === 'running' ? 'glow-accent' : ''}
      fullscreenExpand
      headerActions={
        devices.length > 1 ? (
          <div className="relative" ref={deviceMenuRef}>
            <button
              onClick={() => setShowDeviceMenu((v) => !v)}
              className="p-1.5 hover:bg-niwa-surface-2 rounded-lg transition-colors [[data-panel-fullscreen]_&]:p-2 [[data-panel-fullscreen]_&]:bg-black/60 [[data-panel-fullscreen]_&]:backdrop-blur-sm [[data-panel-fullscreen]_&]:hover:bg-black/80"
            >
              <SwitchCamera size={12} className="text-niwa-text-muted [[data-panel-fullscreen]_&]:text-white/80 [[data-panel-fullscreen]_&]:!w-[18px] [[data-panel-fullscreen]_&]:!h-[18px]" />
            </button>
            {showDeviceMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[200px] glass-card shadow-lg py-1 animate-fade-in">
                {devices.map((d) => (
                  <button
                    key={d.deviceId}
                    onClick={() => {
                      setSelectedDeviceId(d.deviceId);
                      setShowDeviceMenu(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                      d.deviceId === selectedDeviceId
                        ? 'text-niwa-accent bg-niwa-accent/10'
                        : 'text-niwa-text-dim hover:bg-niwa-surface-2'
                    }`}
                  >
                    {d.label
                      ? d.label.toLowerCase().includes('front') ? 'Front Camera (Selfie)'
                        : d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('rear') ? 'Back Camera (Main)'
                        : d.label
                      : `Camera ${d.deviceId.slice(0, 8)}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : undefined
      }
    >
      <div className="relative aspect-video bg-niwa-bg rounded-lg overflow-hidden border border-niwa-border [[data-panel-fullscreen]_&]:aspect-auto [[data-panel-fullscreen]_&]:w-full [[data-panel-fullscreen]_&]:h-full [[data-panel-fullscreen]_&]:rounded-none [[data-panel-fullscreen]_&]:border-0">
        {state.latest_image ? (
          <img src={state.latest_image} alt="Arrangement" className="w-full h-full object-cover" />
        ) : cameraError ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-niwa-surface to-niwa-bg">
            <Camera size={24} className="text-niwa-text-muted mb-2" />
            <span className="text-[10px] text-niwa-text-muted">Camera unavailable: {cameraError}</span>
          </div>
        ) : (
          <video ref={videoCallbackRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        )}

        {/* Model thoughts subtitle overlay */}
        {agentThoughts && latest && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-4 pb-4 pt-12 [[data-panel-fullscreen]_&]:px-12 [[data-panel-fullscreen]_&]:pb-10 [[data-panel-fullscreen]_&]:pt-24">
            <div className="max-w-2xl mx-auto text-center">
              {isOverview && 'artistInstinct' in agentThoughts && agentThoughts.artistInstinct ? (
                <>
                  <div className="mb-2">
                    <span className="inline-flex items-center gap-1.5 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1">
                      <Eye size={12} className="text-niwa-critic" />
                      <span className="text-xs text-niwa-critic font-semibold">Critic</span>
                    </span>
                    <p className="text-sm text-white/95 leading-relaxed mt-1 drop-shadow-lg [[data-panel-fullscreen]_&]:text-lg">
                      {agentThoughts.priority}
                    </p>
                  </div>
                  <div>
                    <span className="inline-flex items-center gap-1.5 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1">
                      <Brain size={12} className="text-niwa-artist" />
                      <span className="text-xs text-niwa-artist font-semibold">Artist</span>
                    </span>
                    <p className="text-sm text-white/95 leading-relaxed mt-1 drop-shadow-lg [[data-panel-fullscreen]_&]:text-lg">
                      {agentThoughts.artistInstinct}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1.5 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1 mb-1">
                    {isCritic ? <Eye size={12} className="text-niwa-critic" /> : <Brain size={12} className="text-niwa-artist" />}
                    <span className={`text-xs font-semibold`} style={{ color: isCritic ? '#f59e0b' : '#06b6d4' }}>{agentThoughts.label}</span>
                  </span>
                  {'priority' in agentThoughts && agentThoughts.priority && (
                    <p className="text-sm text-white/95 leading-relaxed drop-shadow-lg [[data-panel-fullscreen]_&]:text-lg">
                      {agentThoughts.priority}
                    </p>
                  )}
                  {'instinct' in agentThoughts && agentThoughts.instinct && (
                    <p className="text-sm text-white/95 leading-relaxed drop-shadow-lg [[data-panel-fullscreen]_&]:text-lg">
                      {agentThoughts.instinct}
                    </p>
                  )}
                  <p className="text-xs text-white/50 leading-relaxed mt-1 line-clamp-2 [[data-panel-fullscreen]_&]:text-sm">
                    {agentThoughts.reasoning}
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Status indicator */}
        <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-2 py-1">
          <div className={`w-1.5 h-1.5 rounded-full ${state.status === 'running' ? 'bg-niwa-positive animate-pulse-live' : 'bg-niwa-text-muted'}`} />
          <span className="text-[9px] text-white/80 font-medium">
            {state.status === 'running' ? 'REC' : state.status.toUpperCase()}
          </span>
        </div>

        {/* Score overlay */}
        {latest && (
          <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm rounded-lg px-2 py-1">
            <span className="text-[10px] text-white/60">Score</span>
            <span className="text-sm font-bold text-white ml-1">{latest.overall_score}</span>
            <span className={`text-[10px] ml-1 ${latest.actual_delta >= 0 ? 'text-niwa-positive' : 'text-niwa-negative'}`}>
              {latest.actual_delta >= 0 ? '+' : ''}{latest.actual_delta}
            </span>
          </div>
        )}
      </div>
    </Panel>
  );
});
