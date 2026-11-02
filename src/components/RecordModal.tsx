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
  // Default to .mov on Apple devices (iPhone/iPad) for native QuickTime / Photos app compatibility
  const [selectedFormat, setSelectedFormat] = useState<'mov' | 'mp4'>(isAppleDevice ? 'mov' : 'mp4');

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

  const handleClose = () => {
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      } catch (e) {
        console.warn('Video cleanup error in RecordModal:', e);
      }
    }
    onClose();
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const next = !videoRef.current.muted;
    videoRef.current.muted = next;
    setIsPreviewMuted(next);
  };

  const handleDownload = () => {
    if (!videoUrl || !videoBlob) return;
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const ext = selectedFormat;
    const mimeType = ext === 'mov' ? 'video/quicktime' : 'video/mp4';

    // Construct blob with corresponding MIME type
    const exportBlob = new Blob([videoBlob], { type: mimeType });
    const exportUrl = URL.createObjectURL(exportBlob);

    const a = document.createElement('a');
    a.href = exportUrl;
    a.download = `AuraCam-MajesticPose-${dateStr}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(exportUrl), 5000);

    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 3000);
  };

  const handleShare = async () => {
    if (!videoBlob || !navigator.share) return;
    try {
      const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const ext = selectedFormat;
      const mimeType = ext === 'mov' ? 'video/quicktime' : 'video/mp4';
      const file = new File([videoBlob], `AuraCam-MajesticPose-${dateStr}.${ext}`, {
        type: mimeType,
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
            onClick={handleClose}
            className="p-1 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video Preview in 9:16 portrait style */}
        <div className="relative w-full aspect-[9/16] max-h-[50vh] bg-black rounded-xl overflow-hidden shadow-inner border border-white/15 flex items-center justify-center">
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

          {/* Format & Aspect Badge */}
          <div className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-sm border border-white/20 text-[10px] font-bold tracking-wider uppercase text-amber-300">
            .{selectedFormat.toUpperCase()} • 9:16
          </div>
        </div>

        {/* Video Format Selector */}
        <div className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-xs mt-3">
          <div className="flex items-center gap-1.5 text-white/70">
            <span className="font-semibold text-white/90">Output Format:</span>
            <span className="text-[11px] text-amber-300 font-mono">
              {selectedFormat === 'mov' ? 'QuickTime (.MOV)' : 'MPEG-4 (.MP4)'}
            </span>
          </div>
          <div className="flex items-center bg-black/60 p-0.5 rounded-lg border border-white/10">
            <button
              onClick={() => setSelectedFormat('mov')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                selectedFormat === 'mov'
                  ? 'bg-amber-400 text-black shadow-sm'
                  : 'text-white/60 hover:text-white'
              }`}
              title="Apple QuickTime format (.MOV) - Recommended for iPhone and iPad"
            >
              .MOV {isAppleDevice ? '🍎' : ''}
            </button>
            <button
              onClick={() => setSelectedFormat('mp4')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                selectedFormat === 'mp4'
                  ? 'bg-amber-400 text-black shadow-sm'
                  : 'text-white/60 hover:text-white'
              }`}
              title="Universal MP4 format"
            >
              .MP4
            </button>
          </div>
        </div>

        {/* iOS Photo Library Tip */}
        {isAppleDevice && (
          <div className="w-full mt-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center gap-2 text-[11px] text-amber-200/90">
            <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Tap <strong>Save to Photos</strong> ➔ <strong>Save Video</strong> to view directly in your iPhone/iPad Camera Roll!</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="w-full mt-3 space-y-2.5">
          {/* Primary Action Button */}
          {isAppleDevice && typeof navigator !== 'undefined' && 'share' in navigator ? (
            <button
              onClick={handleShare}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-black font-extrabold text-sm tracking-wide shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.98] transition-all"
            >
              <Share2 className="w-4 h-4 text-black" />
              Save to Photos / Camera Roll (.{selectedFormat.toUpperCase()})
            </button>
          ) : (
            <button
              onClick={handleDownload}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-black font-extrabold text-sm tracking-wide shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.98] transition-all"
            >
              {downloaded ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-black" />
                  Saved!
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 text-black" />
                  Download Clip (.{selectedFormat.toUpperCase()})
                </>
              )}
            </button>
          )}

          {/* Secondary Action Grid */}
          <div className="grid grid-cols-2 gap-2">
            {isAppleDevice && typeof navigator !== 'undefined' && 'share' in navigator ? (
              <button
                onClick={handleDownload}
                className="py-2.5 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white flex items-center justify-center gap-2 text-xs font-semibold tracking-wide transition-colors"
                title="Download directly to Files app"
              >
                {downloaded ? <CheckCircle2 className="w-4 h-4 text-amber-400" /> : <Download className="w-4 h-4 text-cyan-400" />}
                {downloaded ? 'Saved!' : `Download .${selectedFormat.toUpperCase()}`}
              </button>
            ) : typeof navigator !== 'undefined' && 'share' in navigator ? (
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
              onClick={handleClose}
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
