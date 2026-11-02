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
  Flame,
  Maximize2,
  Minimize2
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
import { 
  getAvailableCameras, 
  buildMediaConstraints, 
  applyTrackWideZoom, 
  CameraDeviceInfo, 
  AspectRatioMode 
} from './utils/cameraManager';
import { isIOS } from './utils/deviceUtils';
import { PoseBadge } from './components/PoseBadge';
import { ControlsDrawer } from './components/ControlsDrawer';
import { PoseGuideModal } from './components/PoseGuideModal';
import { RecordModal } from './components/RecordModal';

export const App: React.FC = () => {
  // Determine if mobile portrait or iPad
  const isInitialMobile = typeof window !== 'undefined' ? window.innerWidth < 1024 || isIOS() : true;

  // Camera State
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [isModelReady, setIsModelReady] = useState(false);
  const [modelStatus, setModelStatus] = useState<string>('Awakening Divine AI Vision...');
  const [modelError, setModelError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [availableCameras, setAvailableCameras] = useState<CameraDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);
  const [aspectRatioMode, setAspectRatioMode] = useState<AspectRatioMode>(
    isInitialMobile ? 'wide-sensor' : 'landscape-16-9'
  );
  const [cameraResolution, setCameraResolution] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const [isMirrored, setIsMirrored] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [fitMode, setFitMode] = useState<'contain' | 'cover'>('contain'); // Default to 'contain' for wide-angle full view without cropping!
  const [cameraZoom, setCameraZoom] = useState<number>(1.0);

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
  const debouncerRef = useRef<PoseDebouncer>(new PoseDebouncer(250, 400));
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const capturedTracksRef = useRef<MediaStreamTrack[]>([]);
  const isRecordModalOpenRef = useRef<boolean>(false);

  // Animation frame loop
  const animFrameIdRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());
  const lastPoseRef = useRef<PoseType | null>(null);
  const currentLandmarksRef = useRef<NormalizedLandmark[] | null>(null);

  // Initialize Pose Model with progress tracking
  const initPoseModel = useCallback(async () => {
    poseDetectorRef.current = PoseDetectorService.getInstance();
    setIsModelLoading(true);
    setModelError(null);
    setModelStatus('Awakening Divine AI Vision...');

    try {
      await poseDetectorRef.current.init();
      setIsModelReady(true);
      setIsModelLoading(false);
      setModelStatus('AI Vision Active');
    } catch (err: unknown) {
      console.error('Pose detector init failure:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setModelError(msg);
      setModelStatus(`AI Vision Error: ${msg}`);
      setIsModelLoading(false);
    }
  }, []);

  // Enumerate cameras on mount
  useEffect(() => {
    getAvailableCameras().then((cams) => {
      setAvailableCameras(cams);
    });
  }, []);

  // Initialize Audio & Pose Services
  useEffect(() => {
    audioManagerRef.current = new MajesticAudioManager();
    poseDetectorRef.current = PoseDetectorService.getInstance();
    initPoseModel();
  }, [initPoseModel]);

  // Sync settings with WebGL and Audio
  useEffect(() => {
    if (webglPipelineRef.current) {
      webglPipelineRef.current.bloomStrength = bloomIntensity;
      webglPipelineRef.current.isMirrored = isMirrored;
      webglPipelineRef.current.cameraZoom = cameraZoom;
    }
  }, [bloomIntensity, isMirrored, cameraZoom]);

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

  // Start Camera Stream with specified configuration
  const startCameraWithConfig = async (
    nextFacing: 'user' | 'environment',
    nextDeviceId?: string,
    nextAspectMode?: AspectRatioMode
  ) => {
    setCameraError(null);

    // Initialize AudioContext on user gesture
    if (audioManagerRef.current) {
      await audioManagerRef.current.init();
    }

    // Stop existing stream if any and detach
    if (videoRef.current && videoRef.current.srcObject) {
      const existing = videoRef.current.srcObject as MediaStream;
      existing.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
      // Brief pause for iOS hardware camera session release
      await new Promise((r) => setTimeout(r, 60));
    }

    const aspect = nextAspectMode || aspectRatioMode;
    const constraints = buildMediaConstraints({
      facingMode: nextFacing,
      deviceId: nextDeviceId,
      aspectRatioMode: aspect,
    });

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const track = stream.getVideoTracks()[0];
      if (track) {
        await applyTrackWideZoom(track);
      }

      if (videoRef.current) {
        const video = videoRef.current;
        video.muted = true;
        video.playsInline = true;
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.srcObject = stream;

        // On iOS Safari, wait for metadata before play() to ensure videoWidth and videoHeight are populated
        await new Promise<void>((resolve) => {
          if (video.readyState >= 1) {
            resolve();
          } else {
            video.onloadedmetadata = () => resolve();
          }
        });

        await video.play();
        setIsCameraActive(true);

        const vW = video.videoWidth || 1280;
        const vH = video.videoHeight || 720;
        setCameraResolution({ width: vW, height: vH });
      }

      // Refresh camera devices list with actual device permissions granted
      getAvailableCameras().then((cams) => setAvailableCameras(cams));
    } catch (err: unknown) {
      console.warn('Initial camera constraint failed, retrying fallback constraints:', err);
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: nextFacing } },
          audio: false,
        });
        if (videoRef.current) {
          const video = videoRef.current;
          video.muted = true;
          video.playsInline = true;
          video.setAttribute('playsinline', 'true');
          video.setAttribute('webkit-playsinline', 'true');
          video.srcObject = fallbackStream;

          await new Promise<void>((resolve) => {
            if (video.readyState >= 1) resolve();
            else video.onloadedmetadata = () => resolve();
          });

          await video.play();
          setIsCameraActive(true);
          setCameraResolution({
            width: video.videoWidth || 1280,
            height: video.videoHeight || 720,
          });
        }
      } catch (finalErr: unknown) {
        console.error('Camera access denied:', finalErr);
        const error = finalErr as { message?: string };
        setCameraError(error.message || 'Please grant camera access to use the Majestic Gym Pose Filter.');
      }
    }
  };

  // iOS Safari Lifecycle: Auto-resume camera video & audio if paused when tab is foregrounded
  useEffect(() => {
    const handleResume = async () => {
      if (document.visibilityState === 'visible' && isCameraActive && videoRef.current) {
        if (videoRef.current.paused) {
          try {
            await videoRef.current.play();
          } catch (e) {
            console.warn('Auto-resuming camera stream after tab backgrounded:', e);
          }
        }
        if (audioManagerRef.current) {
          audioManagerRef.current.resumeIfSuspended();
        }
      }
    };

    document.addEventListener('visibilitychange', handleResume);
    window.addEventListener('pageshow', handleResume);
    window.addEventListener('focus', handleResume);

    return () => {
      document.removeEventListener('visibilitychange', handleResume);
      document.removeEventListener('pageshow', handleResume);
      window.removeEventListener('focus', handleResume);
    };
  }, [isCameraActive]);

  const startCamera = () => {
    startCameraWithConfig(facingMode, selectedDeviceId, aspectRatioMode);
  };

  // Switch between front and rear cameras
  const switchCamera = async () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    setIsMirrored(nextMode === 'user');
    setSelectedDeviceId(undefined); // Reset device ID to allow default facing
    await startCameraWithConfig(nextMode, undefined, aspectRatioMode);
  };

  // Switch specific camera device
  const handleSelectCamera = async (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    const targetCam = availableCameras.find((c) => c.deviceId === deviceId);
    if (targetCam && targetCam.facing !== 'unknown') {
      setFacingMode(targetCam.facing);
      setIsMirrored(targetCam.facing === 'user');
    }
    await startCameraWithConfig(facingMode, deviceId, aspectRatioMode);
  };

  // Switch aspect ratio mode (3:4 Wide Sensor vs 9:16 Portrait)
  const handleAspectRatioChange = async (mode: AspectRatioMode) => {
    setAspectRatioMode(mode);
    if (isCameraActive) {
      await startCameraWithConfig(facingMode, selectedDeviceId, mode);
    }
  };

  // Main Render & Detection Loop
  const renderFrame = useCallback(() => {
    try {
      // Idle cleanly while record preview modal is open to prevent iOS WebKit GPU context exhaustion
      if (isRecordModalOpenRef.current) {
        return;
      }

      const video = videoRef.current;
      const webglCanvas = webglCanvasRef.current;
      const skeletonCanvas = skeletonCanvasRef.current;

      if (video && video.readyState >= 2 && webglCanvas && video.videoWidth > 0 && video.videoHeight > 0) {
        const now = performance.now();
        const deltaSec = Math.min((now - lastTimeRef.current) / 1000, 0.1);
        lastTimeRef.current = now;

        // Update canvas dimensions to match video stream aspect ratio
        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;

        if (webglCanvas.width !== videoWidth || webglCanvas.height !== videoHeight) {
          webglCanvas.width = videoWidth;
          webglCanvas.height = videoHeight;
          setCameraResolution({ width: videoWidth, height: videoHeight });
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
          webglPipelineRef.current.cameraZoom = cameraZoom;
        } else {
          webglPipelineRef.current.cameraZoom = cameraZoom;
        }

        // 1. Pose Detection via MediaPipe (skip if paused to save CPU)
        if (poseDetectorRef.current && poseDetectorRef.current.isReady() && !video.paused) {
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
    } catch (frameErr) {
      console.warn('Frame render error caught:', frameErr);
    } finally {
      animFrameIdRef.current = requestAnimationFrame(renderFrame);
    }
  }, [detectedPose, forceFilter, isMirrored, poseSensitivity, showSkeleton, bloomIntensity, cameraZoom, triggerMajesticSparkles]);

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
      const captureStreamFn = (canvas as unknown as { captureStream?: (fps: number) => MediaStream; webkitCaptureStream?: (fps: number) => MediaStream }).captureStream ||
        (canvas as unknown as { captureStream?: (fps: number) => MediaStream; webkitCaptureStream?: (fps: number) => MediaStream }).webkitCaptureStream;

      if (!captureStreamFn) {
        throw new Error('Canvas recording is not supported on this browser.');
      }

      const videoStream = captureStreamFn.call(canvas, 30);
      const audioDest = audioManagerRef.current?.getAudioStreamDestination();
      const videoTracks = videoStream.getVideoTracks();
      capturedTracksRef.current = videoTracks;
      const combinedTracks: MediaStreamTrack[] = [...videoTracks];

      if (audioDest && audioDest.stream.getAudioTracks().length > 0) {
        combinedTracks.push(audioDest.stream.getAudioTracks()[0]);
      }

      const streamWithAudio = new MediaStream(combinedTracks);
      const streamVideoOnly = new MediaStream([...videoTracks]);

      const isApple = isIOS();
      // On iOS Safari, prioritize MP4 containers; on Android/Desktop, WebM
      const candidateMimes = isApple
        ? [
            'video/mp4;codecs=avc1,mp4a.40.2',
            'video/mp4;codecs=avc1',
            'video/mp4',
            'video/webm;codecs=vp9,opus',
            'video/webm',
          ]
        : [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm',
            'video/mp4;codecs=avc1',
            'video/mp4',
          ];

      let chosenMime = '';
      for (const m of candidateMimes) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) {
          chosenMime = m;
          break;
        }
      }

      const recorderOptions: MediaRecorderOptions = {};
      if (chosenMime) {
        recorderOptions.mimeType = chosenMime;
      }
      recorderOptions.videoBitsPerSecond = isApple ? 4000000 : 6000000;

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(streamWithAudio, recorderOptions);
      } catch (audioMixErr) {
        console.warn('Combined audio/video MediaRecorder failed on iOS, falling back to video-only track:', audioMixErr);
        recorder = new MediaRecorder(streamVideoOnly, recorderOptions);
      }

      recordChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        // Stop captured canvas tracks to free GPU context and iOS MediaStream resources
        if (capturedTracksRef.current.length > 0) {
          capturedTracksRef.current.forEach((t) => {
            try {
              t.stop();
            } catch (e) {
              console.warn('Track stop error:', e);
            }
          });
          capturedTracksRef.current = [];
        }

        const finalType = recorder.mimeType || (isApple ? 'video/mp4' : 'video/webm');
        const blob = new Blob(recordChunksRef.current, { type: finalType });
        const url = URL.createObjectURL(blob);
        setRecordedBlob(blob);
        setRecordedVideoUrl(url);
        setIsRecordModalOpen(true);
        isRecordModalOpenRef.current = true;
        setIsRecording(false);
        setRecordSeconds(0);
        if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      };

      // CRITICAL FOR IOS: In iOS Safari, timeslice (e.g. 100ms) with video/mp4 creates fragmented unplayable blobs.
      // Calling start() without timeslice produces a single valid MP4 container with the moov atom.
      if (isApple || chosenMime.includes('mp4')) {
        recorder.start();
      } else {
        recorder.start(250);
      }

      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordSeconds(0);

      recordTimerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      console.error('Failed to start recording:', err);
      if (capturedTracksRef.current.length > 0) {
        capturedTracksRef.current.forEach((t) => {
          try {
            t.stop();
          } catch {}
        });
        capturedTracksRef.current = [];
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  // Safely restore camera stream & state when closing record preview modal (e.g., retake or exit)
  const handleCloseRecordModal = useCallback(async () => {
    setIsRecordModalOpen(false);
    isRecordModalOpenRef.current = false;

    if (recordedVideoUrl) {
      URL.revokeObjectURL(recordedVideoUrl);
      setRecordedVideoUrl(null);
    }
    setRecordedBlob(null);

    // iOS Safari / WebKit Media Recovery:
    // When the recorded preview played in RecordModal, iOS Safari pauses or detaches background camera tracks.
    // Ensure the live camera stream is still running, tracks are live, and video playback is unpaused.
    const video = videoRef.current;
    if (!video) return;

    const stream = video.srcObject as MediaStream | null;
    const tracks = stream ? stream.getVideoTracks() : [];
    const hasLiveTracks = tracks.length > 0 && tracks.some((t) => t.readyState === 'live');

    if (hasLiveTracks) {
      if (video.paused) {
        try {
          await video.play();
        } catch (playErr) {
          console.warn('Failed to unpause live camera video on retake, restarting stream:', playErr);
          await startCameraWithConfig(facingMode, selectedDeviceId, aspectRatioMode);
        }
      }
    } else {
      console.log('Camera tracks ended or inactive during modal preview, re-initializing camera...');
      await startCameraWithConfig(facingMode, selectedDeviceId, aspectRatioMode);
    }

    if (audioManagerRef.current) {
      audioManagerRef.current.resumeIfSuspended();
    }
  }, [facingMode, selectedDeviceId, aspectRatioMode, recordedVideoUrl]);

  return (
    <div className="fixed inset-0 w-full h-[100dvh] overflow-hidden bg-[#09090b] flex flex-col items-center justify-center">
      {/* Off-screen Source Video Element (must NOT have display:none on iOS WebKit!) */}
      <video
        ref={videoRef}
        playsInline
        {...{ 'webkit-playsinline': 'true' }}
        muted
        autoPlay
        disablePictureInPicture
        disableRemotePlayback
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '1px',
          height: '1px',
          opacity: 0.001,
          pointerEvents: 'none',
          zIndex: -9999,
        }}
      />

      {/* Camera Live Viewport */}
      {isCameraActive ? (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-black">
          {/* WebGL Filter Output Canvas */}
          <canvas
            ref={webglCanvasRef}
            className={`w-full h-full transition-all duration-300 ${
              fitMode === 'contain' ? 'object-contain' : 'object-cover'
            }`}
          />

          {/* Skeleton Overlay Canvas */}
          <canvas
            ref={skeletonCanvasRef}
            className={`absolute inset-0 w-full h-full pointer-events-none transition-all duration-300 ${
              fitMode === 'contain' ? 'object-contain' : 'object-cover'
            }`}
          />

          {/* Top HUD Header with Safe Area clearance for Notch / Dynamic Island */}
          <header className="absolute top-0 inset-x-0 pt-[max(1rem,env(safe-area-inset-top))] px-4 sm:px-6 pb-2 flex items-center justify-between z-30 pointer-events-none">
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
              {/* Framing Mode Toggle (Wide Fit vs Full Screen) */}
              <button
                onClick={() => setFitMode(fitMode === 'contain' ? 'cover' : 'contain')}
                className={`p-2.5 rounded-full glass-panel border transition-colors shadow-md ${
                  fitMode === 'contain' ? 'text-amber-400 border-amber-400/40 bg-amber-500/10' : 'text-white/60 border-white/10 hover:text-white'
                }`}
                title={fitMode === 'contain' ? 'Wide Angle (Fit View) - Tap for Full Screen' : 'Full Screen - Tap for Wide Angle (Fit View)'}
              >
                {fitMode === 'contain' ? <Minimize2 className="w-4 h-4 text-amber-400" /> : <Maximize2 className="w-4 h-4" />}
              </button>

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

          {/* Center Dynamic HUD Status Badge with Safe Area clearance */}
          <div className="absolute top-[max(5.5rem,calc(env(safe-area-inset-top)+3.5rem))] z-30 pointer-events-auto">
            <PoseBadge
              detectedPose={detectedPose}
              rawPose={rawPose}
              isModelReady={isModelReady}
              statusMessage={modelStatus}
              initError={modelError}
              onRetry={initPoseModel}
            />
          </div>

          {/* Recording Timer Badge */}
          {isRecording && (
            <div className="absolute top-[max(9rem,calc(env(safe-area-inset-top)+7rem))] z-30 flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-600/90 text-white font-mono text-xs font-bold tracking-wider animate-pulse shadow-lg shadow-red-600/50">
              <span className="w-2 h-2 rounded-full bg-white" />
              REC {String(Math.floor(recordSeconds / 60)).padStart(2, '0')}:
              {String(recordSeconds % 60).padStart(2, '0')}
            </div>
          )}

          {/* Floating On-Screen Quick Lens & FOV Selector */}
          <div className="absolute bottom-[max(6.5rem,calc(env(safe-area-inset-bottom)+5.5rem))] z-30 flex items-center gap-1.5 p-1 rounded-full glass-panel border border-white/15 shadow-xl shadow-black/50">
            <button
              onClick={() => handleAspectRatioChange('wide-sensor')}
              className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide transition-all ${
                aspectRatioMode === 'wide-sensor'
                  ? 'bg-gradient-to-r from-amber-400 to-yellow-400 text-black shadow-md shadow-amber-400/30'
                  : 'text-white/75 hover:text-white'
              }`}
            >
              0.5x Ultra Wide
            </button>
            <button
              onClick={() => handleAspectRatioChange('portrait-9-16')}
              className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide transition-all ${
                aspectRatioMode === 'portrait-9-16'
                  ? 'bg-gradient-to-r from-amber-400 to-yellow-400 text-black shadow-md shadow-amber-400/30'
                  : 'text-white/75 hover:text-white'
              }`}
            >
              9:16 Crop
            </button>
            <button
              onClick={() => setFitMode(fitMode === 'contain' ? 'cover' : 'contain')}
              className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide transition-all ${
                fitMode === 'contain'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40'
                  : 'text-white/75 hover:text-white'
              }`}
            >
              {fitMode === 'contain' ? 'Fit View' : 'Fill Screen'}
            </button>
          </div>

          {/* Bottom Floating Control Bar with Home Indicator clearance */}
          <footer className="absolute bottom-0 inset-x-0 pb-[max(1.5rem,env(safe-area-inset-bottom))] px-5 sm:px-8 pt-2 flex items-center justify-around z-30 max-w-lg mx-auto">
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

            {/* Switch Camera Button (or Pose Guide) */}
            {availableCameras.length > 1 ? (
              <button
                onClick={switchCamera}
                className="p-3.5 rounded-full glass-panel text-white/80 hover:text-white border border-white/10 transition-colors"
                title="Switch Front / Rear Camera"
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
        <main className="relative z-10 max-w-lg w-full px-6 py-10 flex flex-col items-center text-center safe-area-top safe-area-bottom">
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
        hasMultipleCameras={availableCameras.length > 1}
        showSkeleton={showSkeleton}
        onSkeletonToggle={() => setShowSkeleton(!showSkeleton)}
        onOpenGuide={() => setIsGuideOpen(true)}
        forceFilter={forceFilter}
        onToggleForceFilter={handleToggleForceFilter}
        fitMode={fitMode}
        onFitModeToggle={() => setFitMode(fitMode === 'contain' ? 'cover' : 'contain')}
        cameraZoom={cameraZoom}
        onCameraZoomChange={setCameraZoom}
        availableCameras={availableCameras}
        selectedDeviceId={selectedDeviceId}
        onSelectCamera={handleSelectCamera}
        aspectRatioMode={aspectRatioMode}
        onAspectRatioChange={handleAspectRatioChange}
        cameraResolution={cameraResolution}
      />

      {/* Pose Guide Modal */}
      <PoseGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
      />

      {/* Record Preview Modal */}
      <RecordModal
        isOpen={isRecordModalOpen}
        onClose={handleCloseRecordModal}
        videoUrl={recordedVideoUrl}
        videoBlob={recordedBlob}
      />
    </div>
  );
};

export default App;
