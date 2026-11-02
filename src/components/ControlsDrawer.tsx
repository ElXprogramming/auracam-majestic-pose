import React from 'react';
import { 
  X, 
  Sliders, 
  Volume2, 
  VolumeX, 
  Sparkles, 
  FlipHorizontal, 
  SwitchCamera, 
  Eye, 
  EyeOff, 
  HelpCircle,
  Activity,
  Maximize2,
  Minimize2,
  ZoomIn,
  RotateCcw,
  Camera as CameraIcon,
  Video
} from 'lucide-react';
import { CameraDeviceInfo, AspectRatioMode } from '../utils/cameraManager';

interface ControlsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  bloomIntensity: number;
  onBloomChange: (v: number) => void;
  audioVolume: number;
  onVolumeChange: (v: number) => void;
  isMuted: boolean;
  onMuteToggle: () => void;
  poseSensitivity: number;
  onSensitivityChange: (v: number) => void;
  isMirrored: boolean;
  onMirrorToggle: () => void;
  onSwitchCamera: () => void;
  hasMultipleCameras: boolean;
  showSkeleton: boolean;
  onSkeletonToggle: () => void;
  onOpenGuide: () => void;
  forceFilter: boolean;
  onToggleForceFilter: () => void;
  fitMode: 'contain' | 'cover';
  onFitModeToggle: () => void;
  cameraZoom: number;
  onCameraZoomChange: (v: number) => void;
  availableCameras: CameraDeviceInfo[];
  selectedDeviceId?: string;
  onSelectCamera: (deviceId: string) => void;
  aspectRatioMode: AspectRatioMode;
  onAspectRatioChange: (mode: AspectRatioMode) => void;
  cameraResolution: { width: number; height: number };
}

export const ControlsDrawer: React.FC<ControlsDrawerProps> = ({
  isOpen,
  onClose,
  bloomIntensity,
  onBloomChange,
  audioVolume,
  onVolumeChange,
  isMuted,
  onMuteToggle,
  poseSensitivity,
  onSensitivityChange,
  isMirrored,
  onMirrorToggle,
  onSwitchCamera,
  hasMultipleCameras,
  showSkeleton,
  onSkeletonToggle,
  onOpenGuide,
  forceFilter,
  onToggleForceFilter,
  fitMode,
  onFitModeToggle,
  cameraZoom,
  onCameraZoomChange,
  availableCameras,
  selectedDeviceId,
  onSelectCamera,
  aspectRatioMode,
  onAspectRatioChange,
  cameraResolution,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-sm h-full glass-panel border-l border-white/10 p-5 sm:p-6 flex flex-col justify-between overflow-y-auto animate-slideLeft safe-area-top safe-area-bottom safe-area-right">
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Sliders className="w-5 h-5 text-amber-400" />
              <h3 className="font-cinzel text-lg font-bold tracking-wide text-white">
                Camera & Aura Controls
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Active Camera Feed Info Badge */}
          {cameraResolution.width > 0 && (
            <div className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-between text-[11px] text-white/70">
              <span className="flex items-center gap-1.5">
                <Video className="w-3.5 h-3.5 text-cyan-400" />
                Stream: <strong className="text-white font-mono">{cameraResolution.width}x{cameraResolution.height}</strong>
              </span>
              <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono text-[10px]">
                {aspectRatioMode === 'wide-sensor' ? '3:4 Full Sensor' : aspectRatioMode === 'portrait-9-16' ? '9:16 Portrait' : '16:9 Landscape'}
              </span>
            </div>
          )}

          {/* Camera Selection Dropdown (if multiple cameras available) */}
          {availableCameras.length > 1 && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-white/80 flex items-center gap-1.5">
                <CameraIcon className="w-3.5 h-3.5 text-amber-400" />
                Select Camera Lens
              </label>
              <select
                value={selectedDeviceId || ''}
                onChange={(e) => onSelectCamera(e.target.value)}
                className="w-full py-2 px-3 rounded-xl bg-white/[0.07] border border-white/15 text-xs text-white focus:outline-none focus:border-amber-400 transition-colors"
              >
                {availableCameras.map((cam, idx) => (
                  <option key={cam.deviceId || idx} value={cam.deviceId} className="bg-[#121218] text-white">
                    {cam.label || `Camera ${idx + 1}`} {cam.isWideAngle ? '✨ (Ultra-Wide)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Sensor Aspect Ratio Mode (Cuts vs Full Field of View) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-amber-300">
                Camera Field of View / Sensor Mode
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => onAspectRatioChange('wide-sensor')}
                className={`py-2 px-2.5 rounded-xl border text-[11px] font-bold text-center transition-all ${
                  aspectRatioMode === 'wide-sensor'
                    ? 'bg-amber-500/25 border-amber-400 text-amber-200 shadow-sm shadow-amber-500/20'
                    : 'bg-white/[0.04] border-white/10 text-white/70 hover:bg-white/[0.08]'
                }`}
              >
                <div>✨ Full Sensor (3:4)</div>
                <div className="text-[9px] font-normal opacity-75">Widest FOV, Zero Crop</div>
              </button>

              <button
                onClick={() => onAspectRatioChange('portrait-9-16')}
                className={`py-2 px-2.5 rounded-xl border text-[11px] font-bold text-center transition-all ${
                  aspectRatioMode === 'portrait-9-16'
                    ? 'bg-amber-500/25 border-amber-400 text-amber-200 shadow-sm shadow-amber-500/20'
                    : 'bg-white/[0.04] border-white/10 text-white/70 hover:bg-white/[0.08]'
                }`}
              >
                <div>TikTok (9:16)</div>
                <div className="text-[9px] font-normal opacity-75">Standard Vertical</div>
              </button>
            </div>
          </div>

          {/* Sliders */}
          <div className="space-y-4 pt-1">
            {/* Camera Zoom / Field of View */}
            <div className="space-y-1.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-amber-300 font-bold">
                  <ZoomIn className="w-3.5 h-3.5 text-amber-400" />
                  Camera Zoom / Scale
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-amber-300 font-mono font-bold">
                    {cameraZoom.toFixed(2)}x
                  </span>
                  {cameraZoom !== 1.0 && (
                    <button
                      onClick={() => onCameraZoomChange(1.0)}
                      className="p-1 hover:bg-white/10 rounded text-white/60 hover:text-white transition-colors"
                      title="Reset Zoom to 1.0x"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              <input
                type="range"
                min="0.65"
                max="1.25"
                step="0.05"
                value={cameraZoom}
                onChange={(e) => onCameraZoomChange(parseFloat(e.target.value))}
                className="w-full accent-amber-500"
              />
              <div className="flex justify-between text-[10px] text-white/50">
                <span>0.65x (Ultra Wide)</span>
                <span>1.0x (Standard)</span>
                <span>1.25x (Close)</span>
              </div>
            </div>

            {/* Bloom Intensity */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-white/90 font-medium">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Bloom & Glow Intensity
                </span>
                <span className="text-amber-400 font-mono font-semibold">
                  {Math.round(bloomIntensity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.2"
                max="2.5"
                step="0.05"
                value={bloomIntensity}
                onChange={(e) => onBloomChange(parseFloat(e.target.value))}
                className="w-full accent-amber-500"
              />
            </div>

            {/* Audio Volume */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <button
                  onClick={onMuteToggle}
                  className="flex items-center gap-1.5 text-white/90 hover:text-amber-400 font-medium transition-colors"
                >
                  {isMuted ? (
                    <VolumeX className="w-3.5 h-3.5 text-red-400" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                  )}
                  <span>Audio Volume (Fairy Harp)</span>
                </button>
                <span className="text-amber-400 font-mono font-semibold">
                  {isMuted ? 'Muted' : `${Math.round(audioVolume * 100)}%`}
                </span>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={isMuted ? 0 : audioVolume}
                onChange={(e) => {
                  if (isMuted) onMuteToggle();
                  onVolumeChange(parseFloat(e.target.value));
                }}
                className="w-full accent-amber-500"
              />
            </div>

            {/* Pose Sensitivity */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-white/90 font-medium">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  Pose Sensitivity
                </span>
                <span className="text-cyan-400 font-mono font-semibold">
                  {poseSensitivity.toFixed(1)}x
                </span>
              </div>
              <input
                type="range"
                min="0.6"
                max="1.5"
                step="0.1"
                value={poseSensitivity}
                onChange={(e) => onSensitivityChange(parseFloat(e.target.value))}
                className="w-full accent-cyan-500"
              />
            </div>
          </div>

          {/* Quick Action Toggles */}
          <div className="pt-2 border-t border-white/10 space-y-2">
            <span className="text-[11px] uppercase tracking-wider text-white/50 font-bold block mb-1">
              Display & Lens Toggles
            </span>

            {/* Framing Mode Toggle */}
            <button
              onClick={onFitModeToggle}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                fitMode === 'contain' 
                  ? 'bg-amber-500/20 border-amber-400/50 text-amber-200 shadow-sm shadow-amber-500/20' 
                  : 'bg-white/[0.04] border-white/10 text-white/70 hover:bg-white/[0.08]'
              }`}
            >
              <span className="flex items-center gap-2">
                {fitMode === 'contain' ? <Minimize2 className="w-4 h-4 text-amber-400" /> : <Maximize2 className="w-4 h-4" />}
                {fitMode === 'contain' ? 'Wide Angle / Fit (Zero Crop)' : 'Fill Screen (Cover)'}
              </span>
              <span className="text-[10px] font-bold uppercase">{fitMode === 'contain' ? 'FIT' : 'FILL'}</span>
            </button>

            {/* Skeleton Toggle */}
            <button
              onClick={onSkeletonToggle}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                showSkeleton 
                  ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200 shadow-sm shadow-cyan-500/20' 
                  : 'bg-white/[0.04] border-white/10 text-white/70 hover:bg-white/[0.08]'
              }`}
            >
              <span className="flex items-center gap-2">
                {showSkeleton ? <Eye className="w-4 h-4 text-cyan-400" /> : <EyeOff className="w-4 h-4" />}
                Neon Pose Skeleton
              </span>
              <span className="text-[10px] font-bold uppercase">{showSkeleton ? 'ON' : 'OFF'}</span>
            </button>

            {/* Horizontal Mirror Toggle */}
            <button
              onClick={onMirrorToggle}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                isMirrored 
                  ? 'bg-amber-500/20 border-amber-400/50 text-amber-200' 
                  : 'bg-white/[0.04] border-white/10 text-white/70 hover:bg-white/[0.08]'
              }`}
            >
              <span className="flex items-center gap-2">
                <FlipHorizontal className="w-4 h-4 text-amber-400" />
                Mirror View (Selfie Mode)
              </span>
              <span className="text-[10px] font-bold uppercase">{isMirrored ? 'MIRRORED' : 'STANDARD'}</span>
            </button>

            {/* Camera Switcher (if available) */}
            {hasMultipleCameras && (
              <button
                onClick={onSwitchCamera}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white/70 hover:bg-white/[0.08] text-xs font-medium transition-all"
              >
                <span className="flex items-center gap-2">
                  <SwitchCamera className="w-4 h-4 text-amber-400" />
                  Flip Front / Rear Camera
                </span>
                <span className="text-[10px] font-bold uppercase">FLIP</span>
              </button>
            )}

            {/* Manual Shader Test Toggle */}
            <button
              onClick={onToggleForceFilter}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                forceFilter 
                  ? 'bg-gradient-to-r from-amber-500/30 to-yellow-500/30 border-amber-400 text-amber-200 shadow-[0_0_15px_rgba(255,215,0,0.3)]' 
                  : 'bg-white/[0.04] border-white/10 text-white/70 hover:bg-white/[0.08]'
              }`}
            >
              <span className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                Force Majestic Filter (Preview)
              </span>
              <span className="text-[10px] font-bold uppercase">{forceFilter ? 'ACTIVE' : 'AUTO'}</span>
            </button>
          </div>
        </div>

        {/* Bottom Help Button */}
        <div className="pt-3 border-t border-white/10">
          <button
            onClick={() => {
              onClose();
              onOpenGuide();
            }}
            className="w-full py-2 px-3 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] text-white flex items-center justify-center gap-2 text-xs font-semibold tracking-wide transition-colors"
          >
            <HelpCircle className="w-4 h-4 text-amber-400" />
            Pose Instructions & Tips
          </button>
        </div>
      </div>
    </div>
  );
};
