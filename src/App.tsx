import React, { useEffect, useRef, useState, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { 
  Camera, 
  RotateCw, 
  Sliders, 
  Sparkles, 
  Video, 
  Square, 
  HelpCircle, 
  Volume2, 
  VolumeX, 
  FlipHorizontal,
  Eye,
  EyeOff,
  Flame
} from 'lucide-react';

import { WebGLFilterPipeline } from './utils/webglRenderer';
import { MajesticAudioManager } from './utils/audioManager';
import { PoseDetectorService } from './utils/poseDetector';
import { 
  classifyPoseGeometry, 
  PoseDebouncer, 
  PoseType, 
  NormalizedLandmark 
} from './utils/poseClassifier';
import { renderNeonSkeleton } from './utils/skeletonRenderer';
import { PoseBadge } from './components/PoseBadge';
import { ControlsDrawer } from './components/ControlsDrawer';
import { PoseGuideModal } from './components/PoseGuideModal';
import { RecordModal } from './components/RecordModal';

export const App: React.FC = () => {
  // State
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [isModelReady, setIsModelReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [isMirrored, setIsMirrored] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(true);

  // Filter & Audio Settings
  const [bloomIntensity, setBloomIntensity] = useState(1.0);
  const [audioVolume, setAudioVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [poseSensitivity, setPoseSensitivity] = useState(1.0);
  const [forceFilter, setForceFilter] = useState(false);

  // Pose Detection State
  const [detectedPose, setDetectedPose] = useState<PoseType | null>(null);
  const [rawPose, setRawPose] = useState<PoseType | null>(null);

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);

  // Drawers & Modals
  const [isControlsOpen, setIsControlsOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  // DOM Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const webglCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const skeletonCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Service instances
  const webglPipelineRef = useRef<WebGLFilterPipeline | null>(null);
  const audioManagerRef = useRef<MajesticAudioManager | null>(null);
  const poseDetectorRef = useRef<PoseDetectorService | null>(null);
  const debouncerRef = useRef<PoseDebouncer>(new PoseDebouncer(250, 280));
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);

  // Animation frame loop
  const animFrameIdRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());
  const lastPoseRef = useRef<PoseType | null>(null);
  const currentLandmarksRef = useRef<NormalizedLandmark[] | null>(null);

  // Check camera devices
  useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');
        setHasMultipleCameras(videoInputs.length > 1);
      }).catch(() => {});
    }
  }, []);

  // Initialize Audio & Pose Services
  useEffect(() => {
    audioManagerRef.current = new MajesticAudioManager();
    poseDetectorRef.current = new PoseDetectorService();

    setIsModelLoading(true);
    poseDetectorRef.current.init().then(() => {
      setIsModelReady(true);
      setIsModelLoading(false);
    }).catch((err) => {
      console.error('Pose detector init failure:', err);
      setIsModelLoading(false);
    });

    return () => {
      if (poseDetectorRef.current) {
        poseDetectorRef.current.close();
      }
    };
  }, []);

  // Sync settings with WebGL and Audio
  useEffect(() => {
    if (webglPipelineRef.current) {
      webglPipelineRef.current.bloomStrength = bloomIntensity;
      webglPipelineRef.current.isMirrored = isMirrored;
    }
  }, [bloomIntensity, isMirrored]);

  useEffect(() => {
    if (audioManagerRef.current) {
      audioManagerRef.current.setVolume(audioVolume);
      audioManagerRef.current.setMuted(isMuted);
    }
  }, [audioVolume, isMuted]);

  // Trigger celebration sparkles
  const triggerMajesticSparkles = useCallback(() => {
    try {
      confetti({
        particleCount: 45,
        spread: 70,
        origin: { y: 0.65 },
        colors: ['#ffd700', '#ffea75', '#ffffff', '#e6c200'],
        disableForReducedMotion: true,
      });
    } catch {
      // ignore
    }
  }, []);

  // Start Camera Stream
  const startCamera = async () => {
    setCameraError(null);

    // Initialize AudioContext on user gesture
    if (audioManagerRef.current) {
      await audioManagerRef.current.init();
    }

    try {
      const isMobile = window.innerWidth < 768;
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: facingMode,
          width: { ideal: isMobile ? 1080 : 1920 },
          height: { ideal: isMobile ? 1920 : 1080 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsCameraActive(true);
      }
    } catch (err: unknown) {
      console.warn('Initial camera constraint failed, retrying basic video constraint:', err);
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facingMode },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
          await videoRef.current.play();
          setIsCameraActive(true);
        }
      } catch (finalErr: unknown) {
        console.error('Camera access denied:', finalErr);
        const error = finalErr as { message?: string };
        setCameraError(error.message || 'Please grant camera access to use the Majestic Gym Pose Filter.');
      }
    }
  };

  // Switch between front and rear cameras
  const switchCamera = async () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    setIsMirrored(nextMode === 'user');

    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: nextMode },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      console.error('Failed to switch camera:', err);
    }
  };

  // Main Render & Detection Loop
  const renderFrame = useCallback(() => {
    const video = videoRef.current;
    const webglCanvas = webglCanvasRef.current;
    const skeletonCanvas = skeletonCanvasRef.current;

    if (video && video.readyState >= 2 && webglCanvas) {
      const now = performance.now();
      const deltaSec = Math.min((now - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = now;

      // Update canvas dimensions to match video stream aspect ratio
      const videoWidth = video.videoWidth || 1280;
      const videoHeight = video.videoHeight || 720;

      if (webglCanvas.width !== videoWidth || webglCanvas.height !== videoHeight) {
        webglCanvas.width = videoWidth;
        webglCanvas.height = videoHeight;
      }

      if (skeletonCanvas && (skeletonCanvas.width !== videoWidth || skeletonCanvas.height !== videoHeight)) {
        skeletonCanvas.width = videoWidth;
        skeletonCanvas.height = videoHeight;
      }

      // Initialize WebGL pipeline if needed
      if (!webglPipelineRef.current) {
        webglPipelineRef.current = new WebGLFilterPipeline(webglCanvas);
        webglPipelineRef.current.bloomStrength = bloomIntensity;
        webglPipelineRef.current.isMirrored = isMirrored;
      }

      // 1. Pose Detection via MediaPipe
      if (poseDetectorRef.current && poseDetectorRef.current.isReady()) {
        const landmarks = poseDetectorRef.current.detectPose(video, now);
        if (landmarks) {
          currentLandmarksRef.current = landmarks;
          const { pose: classifiedPose } = classifyPoseGeometry(landmarks, poseSensitivity);
          setRawPose(classifiedPose);

          const { detectedPose: debouncedPose } = debouncerRef.current.update(classifiedPose, now);

          if (debouncedPose !== lastPoseRef.current) {
            lastPoseRef.current = debouncedPose;
            setDetectedPose(debouncedPose);

            if (debouncedPose) {
              triggerMajesticSparkles();
              if (audioManagerRef.current) {
                audioManagerRef.current.triggerPoseAudio();
              }
            } else if (!forceFilter) {
              if (audioManagerRef.current) {
                audioManagerRef.current.releasePoseAudio();
              }
            }
          }
        } else {
          // No landmarks in this frame
          const { detectedPose: debouncedPose } = debouncerRef.current.update(null, now);
          if (debouncedPose !== lastPoseRef.current) {
            lastPoseRef.current = debouncedPose;
            setDetectedPose(debouncedPose);
            if (!debouncedPose && !forceFilter && audioManagerRef.current) {
              audioManagerRef.current.releasePoseAudio();
            }
          }
        }
      }

      // Filter active condition
      const isMajesticActive = Boolean(detectedPose || forceFilter);

      // 2. Render WebGL Majestic Shader
      webglPipelineRef.current.render(video, now / 1000, deltaSec, isMajesticActive);

      // 3. Render Neon Skeleton Wireframe (if enabled)
      if (skeletonCanvas && showSkeleton && currentLandmarksRef.current) {
        const ctx = skeletonCanvas.getContext('2d');
        if (ctx) {
          renderNeonSkeleton(
            ctx,
            currentLandmarksRef.current,
            skeletonCanvas.width,
            skeletonCanvas.height,
            {
              isMirrored,
              isPoseActive: isMajesticActive,
            }
          );
        }
      } else if (skeletonCanvas) {
        const ctx = skeletonCanvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, skeletonCanvas.width, skeletonCanvas.height);
      }
    }

    animFrameIdRef.current = requestAnimationFrame(renderFrame);
  }, [detectedPose, forceFilter, isMirrored, poseSensitivity, showSkeleton, bloomIntensity, triggerMajesticSparkles]);

  useEffect(() => {
    if (isCameraActive) {
      animFrameIdRef.current = requestAnimationFrame(renderFrame);
    }
    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [isCameraActive, renderFrame]);

  // Handle force filter toggle
  const handleToggleForceFilter = () => {
    const nextVal = !forceFilter;
    setForceFilter(nextVal);
    if (nextVal) {
      triggerMajesticSparkles();
      if (audioManagerRef.current) {
        audioManagerRef.current.triggerPoseAudio();
      }
    } else if (!detectedPose && audioManagerRef.current) {
      audioManagerRef.current.releasePoseAudio();
    }
  };

  // Recording Logic
  const startRecording = () => {
    const canvas = webglCanvasRef.current;
    if (!canvas) return;

    try {
      const videoStream = canvas.captureStream(30);
      const audioDest = audioManagerRef.current?.getAudioStreamDestination();
      const combinedTracks: MediaStreamTrack[] = [...videoStream.getVideoTracks()];

      if (audioDest && audioDest.stream.getAudioTracks().length > 0) {
        combinedTracks.push(audioDest.stream.getAudioTracks()[0]);
      }

      const stream = new MediaStream(combinedTracks);

      let mimeType = 'video/webm;codecs=vp9,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp8,opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'video/mp4';
          }
        }
      }

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : undefined,
        videoBitsPerSecond: 6000000,
      });

      recordChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordChunksRef.current, { type: recorder.mimeType || 'video/webm' });
        const url = URL.createObjectURL(blob);
        setRecordedBlob(blob);
        setRecordedVideoUrl(url);
        setIsRecordModalOpen(true);
        setIsRecording(false);
        setRecordSeconds(0);
        if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      };

      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordSeconds(0);

      recordTimerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#09090b] flex flex-col items-center justify-center">
      {/* Hidden Source Video Element */}
      <video
        ref={videoRef}
        playsInline
        muted
        className="hidden"
      />

      {/* Camera Live Viewport */}
      {isCameraActive ? (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-black">
          {/* WebGL Filter Output Canvas */}
          <canvas
            ref={webglCanvasRef}
            className="w-full h-full object-cover sm:object-contain"
          />

          {/* Skeleton Overlay Canvas */}
          <canvas
            ref={skeletonCanvasRef}
            className="absolute inset-0 w-full h-full object-cover sm:object-contain pointer-events-none"
          />

          {/* Top HUD Header */}
          <header className="absolute top-0 inset-x-0 p-4 sm:p-6 flex items-center justify-between z-30 pointer-events-none">
            {/* Logo */}
            <div className="flex items-center gap-2 pointer-events-auto">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-300 p-0.5 shadow-lg shadow-amber-500/30">
                <div className="w-full h-full bg-[#09090b] rounded-[10px] flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                </div>
              </div>
              <div className="flex flex-col">
                <span className="font-cinzel text-base sm:text-lg font-black tracking-wider text-white">
                  AuraCam
                </span>
                <span className="text-[10px] tracking-widest uppercase text-amber-400 font-semibold">
                  Majestic Pose Filter
                </span>
              </div>
            </div>

            {/* Quick Action Top Bar */}
            <div className="flex items-center gap-2 pointer-events-auto">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="p-2.5 rounded-full glass-panel text-white hover:text-amber-400 border border-white/10 transition-colors shadow-md"
                title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-amber-400" />}
              </button>

              <button
                onClick={() => setShowSkeleton(!showSkeleton)}
                className={`p-2.5 rounded-full glass-panel border transition-colors shadow-md ${
                  showSkeleton ? 'text-cyan-300 border-cyan-400/40 bg-cyan-500/10' : 'text-white/60 border-white/10 hover:text-white'
                }`}
                title="Toggle Pose Skeleton"
              >
                {showSkeleton ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>

              <button
                onClick={() => setIsControlsOpen(true)}
                className="p-2.5 rounded-full glass-panel text-white hover:text-amber-400 border border-white/10 transition-colors shadow-md"
                title="Open Settings"
              >
                <Sliders className="w-4 h-4" />
              </button>
            </div>
          </header>

          {/* Center Dynamic HUD Status Badge */}
          <div className="absolute top-20 sm:top-24 z-30 pointer-events-auto">
            <PoseBadge
              detectedPose={detectedPose}
              rawPose={rawPose}
              isModelReady={isModelReady}
            />
          </div>

          {/* Recording Timer Badge */}
          {isRecording && (
            <div className="absolute top-36 z-30 flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-600/90 text-white font-mono text-xs font-bold tracking-wider animate-pulse shadow-lg shadow-red-600/50">
              <span className="w-2 h-2 rounded-full bg-white" />
              REC {String(Math.floor(recordSeconds / 60)).padStart(2, '0')}:
              {String(recordSeconds % 60).padStart(2, '0')}
            </div>
          )}

          {/* Bottom Floating Control Bar */}
          <footer className="absolute bottom-0 inset-x-0 p-5 sm:p-8 flex items-center justify-around z-30 max-w-lg mx-auto">
            {/* Mirror Toggle */}
            <button
              onClick={() => setIsMirrored(!isMirrored)}
              className={`p-3.5 rounded-full glass-panel border transition-all ${
                isMirrored ? 'text-amber-400 border-amber-400/40' : 'text-white/70 border-white/10 hover:text-white'
              }`}
              title="Flip Mirror Mode"
            >
              <FlipHorizontal className="w-5 h-5" />
            </button>

            {/* Shutter / Record Button */}
            <div className="relative group flex items-center justify-center">
              {isRecording ? (
                <button
                  onClick={stopRecording}
                  className="w-20 h-20 rounded-full border-4 border-red-500 bg-red-600/80 hover:bg-red-600 flex items-center justify-center text-white shadow-[0_0_30px_rgba(239,68,68,0.6)] active:scale-95 transition-all"
                  title="Stop Recording"
                >
                  <Square className="w-8 h-8 fill-current" />
                </button>
              ) : (
                <button
                  onClick={startRecording}
                  className="w-20 h-20 rounded-full p-1 border-4 border-amber-400 bg-black/40 hover:scale-105 active:scale-95 transition-all shadow-[0_0_35px_rgba(255,215,0,0.4)] flex items-center justify-center"
                  title="Record Clip (TikTok 9:16)"
                >
                  <div className="w-full h-full rounded-full bg-gradient-to-tr from-amber-500 via-yellow-400 to-amber-500 flex items-center justify-center text-black font-black">
                    <Video className="w-8 h-8 fill-black" />
                  </div>
                </button>
              )}
            </div>

            {/* Switch Camera Button (or Pose Guide if single camera) */}
            {hasMultipleCameras ? (
              <button
                onClick={switchCamera}
                className="p-3.5 rounded-full glass-panel text-white/80 hover:text-white border border-white/10 transition-colors"
                title="Switch Camera"
              >
                <RotateCw className="w-5 h-5" />
              </button>
            ) : (
              <button
                onClick={() => setIsGuideOpen(true)}
                className="p-3.5 rounded-full glass-panel text-amber-400 border border-amber-500/30 transition-colors hover:scale-105"
                title="Pose Guide"
              >
                <Flame className="w-5 h-5" />
              </button>
            )}
          </footer>
        </div>
      ) : (
        /* Welcome / Start Screen */
        <main className="relative z-10 max-w-lg w-full px-6 py-10 flex flex-col items-center text-center">
          {/* Angelic Glowing Hero Icon */}
          <div className="relative mb-6">
            <div className="absolute -inset-4 rounded-full bg-gradient-to-r from-amber-500 via-yellow-300 to-amber-600 opacity-60 blur-xl animate-pulse" />
            <div className="relative w-24 h-24 rounded-3xl bg-black/80 border-2 border-amber-400/80 flex items-center justify-center shadow-2xl">
              <Sparkles className="w-12 h-12 text-amber-400 animate-spin" style={{ animationDuration: '8s' }} />
            </div>
          </div>

          <h1 className="font-cinzel text-3xl sm:text-4xl font-black tracking-wide text-white mb-2 drop-shadow-md">
            AuraCam
          </h1>
          <p className="font-cinzel text-sm sm:text-base text-amber-300 font-bold uppercase tracking-widest mb-4">
            Majestic Gym Pose Filter
          </p>

          <p className="text-sm text-white/70 max-w-sm mb-8 leading-relaxed">
            Step into divine aesthetic greatness. Powered by WebGL real-time angelic bloom shaders, WebAssembly AI pose tracking, and viral Great Fairy harp audio.
          </p>

          {/* Supported Poses Chips */}
          <div className="flex flex-wrap justify-center gap-2 mb-8 max-w-sm">
            {['Front Double Bicep', 'Zyzz Pose', 'Lat Spread', 'Any Flex'].map((pose) => (
              <span
                key={pose}
                className="px-3 py-1 rounded-full bg-white/[0.06] border border-white/10 text-[11px] font-semibold text-amber-200/90"
              >
                ✨ {pose}
              </span>
            ))}
          </div>

          {/* Error Alert */}
          {cameraError && (
            <div className="w-full mb-6 p-3.5 rounded-xl bg-red-900/40 border border-red-500/50 text-red-200 text-xs sm:text-sm">
              {cameraError}
            </div>
          )}

          {/* Start Camera Action */}
          <button
            onClick={startCamera}
            className="w-full max-w-xs py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-black font-cinzel font-black text-base tracking-wider uppercase shadow-[0_0_35px_rgba(255,215,0,0.45)] hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
          >
            <Camera className="w-6 h-6 fill-current" />
            Start Camera & Aura
          </button>

          <button
            onClick={() => setIsGuideOpen(true)}
            className="mt-4 text-xs text-white/60 hover:text-amber-300 flex items-center gap-1.5 transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            How to strike the 4 gym poses
          </button>

          {/* Loading status indicator */}
          {isModelLoading && (
            <p className="mt-4 text-[11px] text-amber-400/80 animate-pulse">
              Pre-warming AI Pose Engine...
            </p>
          )}
        </main>
      )}

      {/* Settings Drawer */}
      <ControlsDrawer
        isOpen={isControlsOpen}
        onClose={() => setIsControlsOpen(false)}
        bloomIntensity={bloomIntensity}
        onBloomChange={setBloomIntensity}
        audioVolume={audioVolume}
        onVolumeChange={setAudioVolume}
        isMuted={isMuted}
        onMuteToggle={() => setIsMuted(!isMuted)}
        poseSensitivity={poseSensitivity}
        onSensitivityChange={setPoseSensitivity}
        isMirrored={isMirrored}
        onMirrorToggle={() => setIsMirrored(!isMirrored)}
        onSwitchCamera={switchCamera}
        hasMultipleCameras={hasMultipleCameras}
        showSkeleton={showSkeleton}
        onSkeletonToggle={() => setShowSkeleton(!showSkeleton)}
        onOpenGuide={() => setIsGuideOpen(true)}
        forceFilter={forceFilter}
        onToggleForceFilter={handleToggleForceFilter}
      />

      {/* Pose Guide Modal */}
      <PoseGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
      />

      {/* Record Preview Modal */}
      <RecordModal
        isOpen={isRecordModalOpen}
        onClose={() => {
          setIsRecordModalOpen(false);
          if (recordedVideoUrl) {
            URL.revokeObjectURL(recordedVideoUrl);
            setRecordedVideoUrl(null);
          }
        }}
        videoUrl={recordedVideoUrl}
        videoBlob={recordedBlob}
      />
    </div>
  );
};

export default App;
