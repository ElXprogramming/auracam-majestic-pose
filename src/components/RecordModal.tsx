import React, { useRef, useEffect, useState } from 'react';
import { X, Download, Share2, Play, RefreshCw, CheckCircle2, Volume2, VolumeX, Info } from 'lucide-react';
import { isIOS } from '../utils/deviceUtils';

interface RecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoUrl: string | null;
  videoBlob: Blob | null;
}

export const RecordModal: React.FC<RecordModalProps> = ({
  isOpen,
  onClose,
  videoUrl,
  videoBlob,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [isPreviewMuted, setIsPreviewMuted] = useState(false);
  const isAppleDevice = isIOS();

  // Safely initiate video playback on iOS Safari
  useEffect(() => {
    if (!isOpen || !videoUrl || !videoRef.current) return;

    const video = videoRef.current;
    video.currentTime = 0;
    const playPromise = video.play();

    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn('Autoplay with audio restricted on iOS, muting to allow preview:', err);
        setIsPreviewMuted(true);
        video.muted = true;
        video.play().catch(() => {});
      });
    }
  }, [isOpen, videoUrl]);

  if (!isOpen || !videoUrl) return null;

  const toggleMute = () => {
    if (!videoRef.current) return;
    const next = !videoRef.current.muted;
    videoRef.current.muted = next;
    setIsPreviewMuted(next);
  };

  const handleDownload = () => {
    if (!videoUrl) return;
    const a = document.createElement('a');
    a.href = videoUrl;
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    // Determine extension based on blob type
    const ext = videoBlob?.type.includes('mp4') ? 'mp4' : 'webm';
    a.download = `AuraCam-MajesticPose-${dateStr}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 3000);
  };

  const handleShare = async () => {
    if (!videoBlob || !navigator.share) return;
    try {
      const isMp4 = videoBlob.type.includes('mp4');
      const ext = isMp4 ? 'mp4' : 'webm';
      const file = new File([videoBlob], `auracam-majestic.${ext}`, {
        type: isMp4 ? 'video/mp4' : 'video/webm',
      });

      // Check if file sharing is supported by native navigator.canShare
      const canShareFiles = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

      if (canShareFiles) {
        await navigator.share({
          title: 'AuraCam: Majestic Gym Pose Filter',
          text: 'Check out my majestic gym pose transformation! ✨💪',
          files: [file],
        });
      } else {
        // Fallback for browsers that support text share but not file sharing
        await navigator.share({
          title: 'AuraCam: Majestic Gym Pose Filter',
          text: 'Check out my majestic gym pose transformation! ✨💪',
          url: window.location.href,
        });
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        console.warn('Native share error or dismissed:', err);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fadeIn safe-area-top safe-area-bottom">
      <div className="relative w-full max-w-sm sm:max-w-md rounded-2xl glass-panel p-5 border border-amber-500/40 text-white shadow-2xl flex flex-col items-center max-h-[95vh] overflow-y-auto">
        {/* Header */}
        <div className="w-full flex items-center justify-between pb-3 border-b border-white/10 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">✨</span>
            <h3 className="font-cinzel text-base sm:text-lg font-bold text-amber-300">
              Majestic Clip Ready
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video Preview in 9:16 portrait style */}
        <div className="relative w-full aspect-[9/16] max-h-[55vh] bg-black rounded-xl overflow-hidden shadow-inner border border-white/15 flex items-center justify-center">
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            playsInline
            {...{ 'webkit-playsinline': 'true' }}
            loop
            className="w-full h-full object-contain"
          />

          {/* Quick Mute/Unmute Floating Button */}
          <button
            onClick={toggleMute}
            className="absolute bottom-3 right-3 p-2 rounded-full bg-black/70 backdrop-blur-sm border border-white/20 text-white hover:text-amber-400 transition-colors shadow-md"
            title={isPreviewMuted ? 'Unmute Preview' : 'Mute Preview'}
          >
            {isPreviewMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-amber-400" />}
          </button>

          {/* TikTok Badge */}
          <div className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-sm border border-white/20 text-[10px] font-bold tracking-wider uppercase text-white/90">
            TikTok 9:16
          </div>
        </div>

        {/* iOS Photo Library Tip */}
        {isAppleDevice && (
          <div className="w-full mt-2.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center gap-2 text-[11px] text-amber-200/90">
            <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Tap <strong>Share Video</strong> ➔ <strong>Save Video</strong> to save directly to iOS Photos!</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="w-full mt-3 space-y-2.5">
          <button
            onClick={handleDownload}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-black font-extrabold text-sm tracking-wide shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.98] transition-all"
          >
            {downloaded ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-black" />
                Downloaded!
              </>
            ) : (
              <>
                <Download className="w-4 h-4 text-black" />
                Download Clip (TikTok Ready)
              </>
            )}
          </button>

          <div className="grid grid-cols-2 gap-2">
            {typeof navigator !== 'undefined' && 'share' in navigator ? (
              <button
                onClick={handleShare}
                className="py-2.5 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white flex items-center justify-center gap-2 text-xs font-semibold tracking-wide transition-colors"
              >
                <Share2 className="w-4 h-4 text-cyan-400" />
                Share Video
              </button>
            ) : (
              <button
                onClick={() => {
                  if (videoRef.current) {
                    videoRef.current.currentTime = 0;
                    videoRef.current.play();
                  }
                }}
                className="py-2.5 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white flex items-center justify-center gap-2 text-xs font-semibold tracking-wide transition-colors"
              >
                <Play className="w-4 h-4 text-amber-400" />
                Replay
              </button>
            )}

            <button
              onClick={onClose}
              className="py-2.5 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white/80 hover:text-white flex items-center justify-center gap-2 text-xs font-semibold tracking-wide transition-colors"
            >
              <RefreshCw className="w-4 h-4 text-white/60" />
              Retake Clip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
