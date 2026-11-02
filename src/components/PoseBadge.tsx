import React from 'react';
import { PoseType } from '../utils/poseClassifier';
import { Sparkles, Scan, Dumbbell, AlertTriangle, RefreshCw } from 'lucide-react';

interface PoseBadgeProps {
  detectedPose: PoseType | null;
  rawPose: PoseType | null;
  isModelReady: boolean;
  statusMessage?: string;
  initError?: string | null;
  onRetry?: () => void;
}

export const PoseBadge: React.FC<PoseBadgeProps> = ({
  detectedPose,
  rawPose,
  isModelReady,
  statusMessage,
  initError,
  onRetry,
}) => {
  if (initError) {
    return (
      <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-red-950/80 border border-red-500/50 text-red-200 text-xs font-semibold shadow-lg shadow-black/60">
        <AlertTriangle className="w-4 h-4 text-red-400" />
        <span>AI Vision Issue</span>
        {onRetry && (
          <button
            onClick={onRetry}
            className="ml-1 px-2 py-0.5 rounded-full bg-red-800 hover:bg-red-700 text-white flex items-center gap-1 transition-colors"
          >
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        )}
      </div>
    );
  }

  if (!isModelReady) {
    return (
      <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full glass-panel border border-amber-500/30 text-amber-200 text-xs sm:text-sm font-semibold tracking-wider uppercase animate-pulse shadow-lg shadow-black/50">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
        {statusMessage || 'Awakening Divine AI Vision...'}
      </div>
    );
  }

  if (detectedPose) {
    return (
      <div className="relative group">
        {/* Divine golden halo animation */}
        <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 opacity-80 blur-md animate-pulse" />
        <div className="relative inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-black/85 border border-amber-300 text-amber-300 shadow-[0_0_35px_rgba(255,215,0,0.5)] transition-all duration-300">
          <Sparkles className="w-5 h-5 text-amber-300 animate-spin" style={{ animationDuration: '4s' }} />
          <div className="flex flex-col text-left">
            <span className="text-[10px] uppercase tracking-widest text-amber-200/90 font-bold">
              Majestic Pose Detected
            </span>
            <span className="font-cinzel text-sm sm:text-base font-black tracking-wide text-white drop-shadow-[0_2px_10px_rgba(255,215,0,0.8)]">
              {detectedPose}
            </span>
          </div>
          <Dumbbell className="w-5 h-5 text-amber-400" />
        </div>
      </div>
    );
  }

  // Searching state with subtle hint if raw pose is partially detected
  return (
    <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full glass-badge text-cyan-200 text-xs sm:text-sm font-medium tracking-wide shadow-lg shadow-black/40">
      <Scan className={`w-4 h-4 ${rawPose ? 'text-amber-400 animate-bounce' : 'text-cyan-400 animate-pulse'}`} />
      <div className="flex items-center gap-2">
        <span className="tracking-wider uppercase text-cyan-300/80 font-bold text-[11px] sm:text-xs">
          {rawPose ? `HOLD ${rawPose.toUpperCase()}...` : 'SEARCHING FOR POSE...'}
        </span>
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
      </div>
    </div>
  );
};
