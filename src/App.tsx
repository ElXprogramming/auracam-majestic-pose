import React, { useEffect, useRef, useState, useCallback, lazy, Suspense, memo } from 'react';
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
  Minimize2,
} from 'lucide-react';

import { WebGLFilterPipeline } from './utils/webglRenderer';
import { MajesticAudioManager } from './utils/audioManager';
import { PoseDetectorService } from './utils/poseDetector';
import {
  classifyPoseGeometry,
  PoseDebouncer,
  PoseType,
  NormalizedLandmark,
} from './utils/poseClassifier';
import { renderNeonSkeleton } from './utils/skeletonRenderer';
import {
  getAvailableCameras,
  buildMediaConstraints,
  applyTrackWideZoom,
  CameraDeviceInfo,
  AspectRatioMode,
} from './utils/cameraManager';
import { isIOS } from './utils/deviceUtils';
import { PoseBadge } from './components/PoseBadge';

// Lazy-load secondary drawers & modals so initial bundle stays minimal
const ControlsDrawer = lazy(() => import('./components/ControlsDrawer'));
const PoseGuideModal = lazy(() => import('./components/PoseGuideModal'));
const RecordModal = lazy(() => import('./components/RecordModal'));

const SUPPORTED_POSE_CHIPS = ['Front Double Bicep', 'Zyzz Pose', 'Lat Spread', 'Any Flex'] as const;
const CONFETTI_COLORS = ['#ffd700', '#ffea75', '#ffffff', '#e6c200'];

let cachedConfettiFn: ((opts: Record<string, unknown>) => unknown) | null = null;
function loadConfetti() {
  if (cachedConfettiFn) return Promise.resolve(cachedConfettiFn);
  return import('canvas-confetti').then((mod) => {
    cachedConfettiFn = mod.default as unknown as (opts: Record<string, unknown>) => unknown;
    return cachedConfettiFn;
  });
}

// Isolated timer badge prevents 1Hz App-wide re-renders during recording
const RecordingTimerBadge: React.FC = memo(() => {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="absolute top-[max(9rem,calc(env(safe-area-inset-top)+7rem))] z-30 flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-600/90 text-white font-mono text-xs font-bold tracking-wider animate-pulse shadow-lg shadow-red-600/50">
      <span className="w-2 h-2 rounded-full bg-white" />
      REC {String(Math.floor(seconds / 60)).padStart(2, '0')}:
      {String(seconds % 60).padStart(2, '0')}
    </div>
  );
});
RecordingTimerBadge.displayName = 'RecordingTimerBadge';

export const App: React.FC = () => {
  const isInitialMobile = typeof window !== 'undefined' ? window.innerWidth < 1024 || isIOS() : true;

  // Camera & AI State
  const [isCameraActive, setIsCameraActive] = useState(false);
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
  const [fitMode, setFitMode] = useState<'contain' | 'cover'>('contain');
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
  const skeletonCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  // Service instances
  const webglPipelineRef = useRef<WebGLFilterPipeline | null>(null);
  const audioManagerRef = useRef<MajesticAudioManager | null>(null);
  const poseDetectorRef = useRef<PoseDetectorService | null>(null);
  const debouncerRef = useRef<PoseDebouncer>(new PoseDebouncer(250, 400));
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const capturedTracksRef = useRef<MediaStreamTrack[]>([]);
  const recordedVideoUrlRef = useRef<string | null>(null);

  // Render loop state refs (prevents RAF teardown/re-creation on React state updates)
  const animFrameIdRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());
  const lastPoseRef = useRef<PoseType | null>(null);
  const lastRawPoseRef = useRef<PoseType | null>(null);
  const currentLandmarksRef = useRef<NormalizedLandmark[] | null>(null);
  const lastDrawnLandmarksRef = useRef<NormalizedLandmark[] | null>(null);
  const lastDrawnSkeletonMirrorRef = useRef<boolean | null>(null);
  const lastDrawnSkeletonActiveRef = useRef<boolean | null>(null);
  const isSkeletonClearedRef = useRef<boolean>(true);

  const liveSettingsRef = useRef({
    isMirrored,
    showSkeleton,
    poseSensitivity,
    forceFilter,
    bloomIntensity,
    cameraZoom,
  });
  liveSettingsRef.current = {
    isMirrored,
    showSkeleton,
    poseSensitivity,
    forceFilter,
    bloomIntensity,
    cameraZoom,
  };

  // Initialize Pose Model
  const initPoseModel = useCallback(async () => {
    poseDetectorRef.current = PoseDetectorService.getInstance();
    setModelError(null);
    setModelStatus('Awakening Divine AI Vision...');

    try {
      await poseDetectorRef.current.init();
      setIsModelReady(true);
      setModelStatus('AI Vision Active');
    } catch (err: unknown) {
      console.error('Pose detector init failure:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setModelError(msg);
      setModelStatus(`AI Vision Error: ${msg}`);
    }
  }, []);

  // Enumerate cameras & check query params on mount
  useEffect(() => {
    getAvailableCameras().then(setAvailableCameras);

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('guide') === '1') {
        setIsGuideOpen(true);
      }
    }
  }, []);

  // Initialize services on mount and clean up resources on unmount
  useEffect(() => {
    const audioManager = new MajesticAudioManager();
    audioManagerRef.current = audioManager;
    poseDetectorRef.current = PoseDetectorService.getInstance();
    initPoseModel();

    // Warm up confetti and compressed audio bytes during browser idle time
    const idleWarmup = () => {
      void audioManager.preloadTrackBytes();
      void loadConfetti();
    };
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(idleWarmup);
    } else {
      setTimeout(idleWarmup, 400);
    }

    return () => {
      if (animFrameIdRef.current !== null) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = null;
      }
      capturedTracksRef.current.forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
      if (recordedVideoUrlRef.current) {
        URL.revokeObjectURL(recordedVideoUrlRef.current);
      }
      webglPipelineRef.current?.destroy();
      webglPipelineRef.current = null;
      audioManager.destroy();
    };
  }, [initPoseModel]);

  // Sync settings with WebGL and Audio
  useEffect(() => {
    const pipeline = webglPipelineRef.current;
    if (pipeline) {
      pipeline.bloomStrength = bloomIntensity;
      pipeline.isMirrored = isMirrored;
      pipeline.cameraZoom = cameraZoom;
    }
  }, [bloomIntensity, isMirrored, cameraZoom]);

  useEffect(() => {
    const audio = audioManagerRef.current;
    if (audio) {
      audio.setVolume(audioVolume);
      audio.setMuted(isMuted);
    }
  }, [audioVolume, isMuted]);

  // Trigger celebration sparkles
  const triggerMajesticSparkles = useCallback(() => {
    loadConfetti()
      .then((confetti) => {
        confetti({
          particleCount: 45,
          spread: 70,
          origin: { y: 0.65 },
          colors: CONFETTI_COLORS,
          disableForReducedMotion: true,
        });
      })
      .catch(() => {});
  }, []);

  // Start Camera Stream with specified configuration
  const startCameraWithConfig = useCallback(
    async (
      nextFacing: 'user' | 'environment',
      nextDeviceId?: string,
      nextAspectMode?: AspectRatioMode
    ) => {
      setCameraError(null);

      // Unlock AudioContext synchronously in user gesture without blocking camera acquisition on audio download
      audioManagerRef.current?.init();

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

      const attachStream = async (stream: MediaStream) => {
        const video = videoRef.current;
        if (!video) return;
        video.muted = true;
        video.playsInline = true;
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.srcObject = stream;

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
        setCameraResolution((prev) =>
          prev.width === vW && prev.height === vH ? prev : { width: vW, height: vH }
        );
      };

      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        const track = stream.getVideoTracks()[0];
        if (track) {
          await applyTrackWideZoom(track);
        }

        await attachStream(stream);
        getAvailableCameras().then(setAvailableCameras);
      } catch (err: unknown) {
        console.warn('Initial camera constraint failed, retrying fallback constraints:', err);
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: nextFacing } },
            audio: false,
          });
          await attachStream(fallbackStream);
        } catch (finalErr: unknown) {
          console.error('Camera access denied:', finalErr);
          const error = finalErr as { message?: string };
          setCameraError(error.message || 'Please grant camera access to use the Majestic Gym Pose Filter.');
        }
      }
    },
    [aspectRatioMode]
  );

  // iOS Safari / iPadOS Lifecycle: Auto-resume camera video & audio when tab returns to foreground
  useEffect(() => {
    const handleResume = async () => {
      if (document.visibilityState === 'visible' && isCameraActive && videoRef.current) {
        const stream = videoRef.current.srcObject as MediaStream | null;
        const tracks = stream ? stream.getVideoTracks() : [];
        const hasLiveTracks = tracks.length > 0 && tracks.some((t) => t.readyState === 'live');

        if (hasLiveTracks) {
          if (videoRef.current.paused) {
            try {
              await videoRef.current.play();
            } catch (e) {
              console.warn('Auto-resuming camera stream after tab backgrounded:', e);
            }
          }
        } else {
          try {
            await startCameraWithConfig(facingMode, selectedDeviceId, aspectRatioMode);
          } catch (e) {
            console.warn('Failed to restart camera after foregrounding:', e);
          }
        }

        audioManagerRef.current?.resumeIfSuspended();
      }
    };

    document.addEventListener('visibilitychange', handleResume);
    window.addEventListener('pageshow', handleResume);
    window.addEventListener('focus', handleResume);

    return () => {
      document.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('pageshow', handleResume);
      window.removeEventListener('focus', handleResume);
    };
  }, [isCameraActive, facingMode, selectedDeviceId, aspectRatioMode, startCameraWithConfig]);

  const startCamera = useCallback(() => {
    void startCameraWithConfig(facingMode, selectedDeviceId, aspectRatioMode);
  }, [facingMode, selectedDeviceId, aspectRatioMode, startCameraWithConfig]);

  const switchCamera = useCallback(async () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    setIsMirrored(nextMode === 'user');
    setSelectedDeviceId(undefined);
    await startCameraWithConfig(nextMode, undefined, aspectRatioMode);
  }, [facingMode, aspectRatioMode, startCameraWithConfig]);

  const handleSelectCamera = useCallback(
    async (deviceId: string) => {
      setSelectedDeviceId(deviceId);
      const targetCam = availableCameras.find((c) => c.deviceId === deviceId);
      let nextFacing = facingMode;
      if (targetCam && targetCam.facing !== 'unknown') {
        nextFacing = targetCam.facing;
        setFacingMode(nextFacing);
        setIsMirrored(nextFacing === 'user');
      }
      await startCameraWithConfig(nextFacing, deviceId, aspectRatioMode);
    },
    [availableCameras, facingMode, aspectRatioMode, startCameraWithConfig]
  );

  const handleAspectRatioChange = useCallback(
    async (mode: AspectRatioMode) => {
      setAspectRatioMode(mode);
      if (isCameraActive) {
        await startCameraWithConfig(facingMode, selectedDeviceId, mode);
      }
    },
    [isCameraActive, facingMode, selectedDeviceId, startCameraWithConfig]
  );

  // Stable Main Render & Detection Loop (zero dependency churn)
  const renderFrame = useCallback(() => {
    try {
      const video = videoRef.current;
      const webglCanvas = webglCanvasRef.current;
      const skeletonCanvas = skeletonCanvasRef.current;

      if (video && video.readyState >= 2 && webglCanvas && video.videoWidth > 0 && video.videoHeight > 0) {
        const now = performance.now();
        const deltaSec = Math.min((now - lastTimeRef.current) / 1000, 0.1);
        lastTimeRef.current = now;

        const {
          isMirrored: mirrorNow,
          showSkeleton: showSkeletonNow,
          poseSensitivity: sensitivityNow,
          forceFilter: forceNow,
          bloomIntensity: bloomNow,
          cameraZoom: zoomNow,
        } = liveSettingsRef.current;

        // Sync canvas dimensions only when video stream dimensions change
        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;

        if (webglCanvas.width !== videoWidth || webglCanvas.height !== videoHeight) {
          webglCanvas.width = videoWidth;
          webglCanvas.height = videoHeight;
          setCameraResolution((prev) =>
            prev.width === videoWidth && prev.height === videoHeight
              ? prev
              : { width: videoWidth, height: videoHeight }
          );
        }

        if (skeletonCanvas && (skeletonCanvas.width !== videoWidth || skeletonCanvas.height !== videoHeight)) {
          skeletonCanvas.width = videoWidth;
          skeletonCanvas.height = videoHeight;
          skeletonCtxRef.current = skeletonCanvas.getContext('2d');
          lastDrawnLandmarksRef.current = null;
        }

        // Initialize WebGL pipeline lazily once canvas is mounted
        if (!webglPipelineRef.current) {
          const pipeline = new WebGLFilterPipeline(webglCanvas);
          pipeline.bloomStrength = bloomNow;
          pipeline.isMirrored = mirrorNow;
          pipeline.cameraZoom = zoomNow;
          webglPipelineRef.current = pipeline;
        }

        // 1. Pose Detection via MediaPipe (skip if paused to save CPU)
        if (poseDetectorRef.current && poseDetectorRef.current.isReady() && !video.paused) {
          const landmarks = poseDetectorRef.current.detectPose(video, now);
          currentLandmarksRef.current = landmarks;

          if (landmarks) {
            const { pose: classifiedPose } = classifyPoseGeometry(landmarks, sensitivityNow);
            if (classifiedPose !== lastRawPoseRef.current) {
              lastRawPoseRef.current = classifiedPose;
              setRawPose(classifiedPose);
            }

            const { detectedPose: debouncedPose } = debouncerRef.current.update(classifiedPose, now);

            if (debouncedPose !== lastPoseRef.current) {
              lastPoseRef.current = debouncedPose;
              setDetectedPose(debouncedPose);

              if (debouncedPose) {
                triggerMajesticSparkles();
                audioManagerRef.current?.triggerPoseAudio();
              } else if (!forceNow) {
                audioManagerRef.current?.releasePoseAudio();
              }
            }
          } else {
            if (lastRawPoseRef.current !== null) {
              lastRawPoseRef.current = null;
              setRawPose(null);
            }

            const { detectedPose: debouncedPose } = debouncerRef.current.update(null, now);
            if (debouncedPose !== lastPoseRef.current) {
              lastPoseRef.current = debouncedPose;
              setDetectedPose(debouncedPose);
              if (!debouncedPose && !forceNow) {
                audioManagerRef.current?.releasePoseAudio();
              }
            }
          }
        }

        // Active aura condition
        const isMajesticActive = Boolean(lastPoseRef.current || forceNow);

        // 2. Render WebGL Majestic Shader
        webglPipelineRef.current.render(video, now / 1000, deltaSec, isMajesticActive);

        // 3. Render Neon Skeleton Wireframe (dirty-checked to avoid redundant 2D rasterization)
        if (skeletonCanvas) {
          const landmarks = currentLandmarksRef.current;
          if (showSkeletonNow && landmarks) {
            if (
              landmarks !== lastDrawnLandmarksRef.current ||
              mirrorNow !== lastDrawnSkeletonMirrorRef.current ||
              isMajesticActive !== lastDrawnSkeletonActiveRef.current
            ) {
              const ctx = skeletonCtxRef.current || (skeletonCtxRef.current = skeletonCanvas.getContext('2d'));
              if (ctx) {
                renderNeonSkeleton(ctx, landmarks, skeletonCanvas.width, skeletonCanvas.height, {
                  isMirrored: mirrorNow,
                  isPoseActive: isMajesticActive,
                });
                lastDrawnLandmarksRef.current = landmarks;
                lastDrawnSkeletonMirrorRef.current = mirrorNow;
                lastDrawnSkeletonActiveRef.current = isMajesticActive;
                isSkeletonClearedRef.current = false;
              }
            }
          } else if (!isSkeletonClearedRef.current) {
            const ctx = skeletonCtxRef.current || (skeletonCtxRef.current = skeletonCanvas.getContext('2d'));
            if (ctx) {
              ctx.clearRect(0, 0, skeletonCanvas.width, skeletonCanvas.height);
              lastDrawnLandmarksRef.current = null;
              isSkeletonClearedRef.current = true;
            }
          }
        }
      }
    } catch (frameErr) {
      console.warn('Frame render error caught:', frameErr);
    }

    animFrameIdRef.current = requestAnimationFrame(renderFrame);
  }, [triggerMajesticSparkles]);

  // Run RAF loop only while camera is active and preview modal is closed
  useEffect(() => {
    if (isCameraActive && !isRecordModalOpen) {
      lastTimeRef.current = performance.now();
      animFrameIdRef.current = requestAnimationFrame(renderFrame);
    }
    return () => {
      if (animFrameIdRef.current !== null) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
    };
  }, [isCameraActive, isRecordModalOpen, renderFrame]);

  // UI toggle handlers (memoized for React.memo children)
  const handleToggleForceFilter = useCallback(() => {
    setForceFilter((prev) => {
      const nextVal = !prev;
      if (nextVal) {
        triggerMajesticSparkles();
        audioManagerRef.current?.triggerPoseAudio();
      } else if (!lastPoseRef.current) {
        audioManagerRef.current?.releasePoseAudio();
      }
      return nextVal;
    });
  }, [triggerMajesticSparkles]);

  const handleToggleFitMode = useCallback(() => {
    setFitMode((prev) => (prev === 'contain' ? 'cover' : 'contain'));
  }, []);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const handleToggleSkeleton = useCallback(() => {
    setShowSkeleton((prev) => !prev);
  }, []);

  const handleToggleMirror = useCallback(() => {
    setIsMirrored((prev) => !prev);
  }, []);

  const handleCloseControls = useCallback(() => setIsControlsOpen(false), []);
  const handleOpenGuide = useCallback(() => setIsGuideOpen(true), []);
  const handleCloseGuide = useCallback(() => setIsGuideOpen(false), []);

  // Recording Logic
  const startRecording = useCallback(() => {
    const canvas = webglCanvasRef.current;
    if (!canvas) return;

    try {
      const captureStreamFn =
        (canvas as unknown as { captureStream?: (fps: number) => MediaStream; webkitCaptureStream?: (fps: number) => MediaStream }).captureStream ||
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
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(m)) {
          chosenMime = m;
          break;
        }
      }

      const recorderOptions: MediaRecorderOptions = {
        videoBitsPerSecond: isApple ? 4000000 : 6000000,
      };
      if (chosenMime) {
        recorderOptions.mimeType = chosenMime;
      }

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
        recordChunksRef.current = [];

        if (recordedVideoUrlRef.current) {
          URL.revokeObjectURL(recordedVideoUrlRef.current);
        }
        const url = URL.createObjectURL(blob);
        recordedVideoUrlRef.current = url;

        setRecordedBlob(blob);
        setRecordedVideoUrl(url);
        setIsRecordModalOpen(true);
        setIsRecording(false);
      };

      // On iOS Safari / MP4 containers, omit timeslice so a single valid moov atom is written
      if (isApple || chosenMime.includes('mp4')) {
        recorder.start();
      } else {
        recorder.start(250);
      }

      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording:', err);
      capturedTracksRef.current.forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
      capturedTracksRef.current = [];
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // Safely restore camera stream & state when closing record preview modal
  const handleCloseRecordModal = useCallback(async () => {
    setIsRecordModalOpen(false);

    if (recordedVideoUrlRef.current) {
      URL.revokeObjectURL(recordedVideoUrlRef.current);
      recordedVideoUrlRef.current = null;
    }
    setRecordedVideoUrl(null);
    setRecordedBlob(null);

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
      await startCameraWithConfig(facingMode, selectedDeviceId, aspectRatioMode);
    }

    audioManagerRef.current?.resumeIfSuspended();
  }, [facingMode, selectedDeviceId, aspectRatioMode, startCameraWithConfig]);

  return (
    <div className="fixed inset-0 w-full h-[100dvh] overflow-hidden bg-[#09090b] flex flex-col items-center justify-center">
      {/* Ambient Celestial Aura Background on Welcome Screen */}
      {!isCameraActive && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden flex items-center justify-center">
          <div className="w-[720px] h-[720px] rounded-full bg-gradient-to-tr from-amber-600/20 via-yellow-500/10 to-transparent blur-3xl opacity-80" />
          <div className="absolute top-0 inset-x-0 h-48 bg-gradient-to-b from-amber-500/10 via-amber-500/5 to-transparent" />
          <div className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-amber-500/10 blur-3xl" />
          <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-yellow-500/10 blur-3xl" />
        </div>
      )}

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
            className={`w-full h-full ${fitMode === 'contain' ? 'object-contain' : 'object-cover'}`}
          />

          {/* Skeleton Overlay Canvas */}
          <canvas
            ref={skeletonCanvasRef}
            className={`absolute inset-0 w-full h-full pointer-events-none ${
              fitMode === 'contain' ? 'object-contain' : 'object-cover'
            } ${showSkeleton ? 'opacity-100' : 'opacity-0'}`}
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
              <button
                onClick={handleToggleFitMode}
                className={`p-2.5 rounded-full glass-panel border transition-colors shadow-md ${
                  fitMode === 'contain' ? 'text-amber-400 border-amber-400/40 bg-amber-500/10' : 'text-white/60 border-white/10 hover:text-white'
                }`}
                title={fitMode === 'contain' ? 'Wide Angle (Fit View) - Tap for Full Screen' : 'Full Screen - Tap for Wide Angle (Fit View)'}
              >
                {fitMode === 'contain' ? <Minimize2 className="w-4 h-4 text-amber-400" /> : <Maximize2 className="w-4 h-4" />}
              </button>

              <button
                onClick={handleToggleMute}
                className="p-2.5 rounded-full glass-panel text-white hover:text-amber-400 border border-white/10 transition-colors shadow-md"
                title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-amber-400" />}
              </button>

              <button
                onClick={handleToggleSkeleton}
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

          {/* Isolated Recording Timer Badge */}
          {isRecording && <RecordingTimerBadge />}

          {/* Floating On-Screen Quick Lens & FOV Selector */}
          <div className="absolute bottom-[max(6.5rem,calc(env(safe-area-inset-bottom)+5.5rem))] z-30 flex items-center gap-1.5 p-1 rounded-full glass-panel border border-white/15 shadow-xl shadow-black/50">
            <button
              onClick={() => handleAspectRatioChange('wide-sensor')}
              className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide transition-colors ${
                aspectRatioMode === 'wide-sensor'
                  ? 'bg-gradient-to-r from-amber-400 to-yellow-400 text-black shadow-md shadow-amber-400/30'
                  : 'text-white/75 hover:text-white'
              }`}
            >
              0.5x Ultra Wide
            </button>
            <button
              onClick={() => handleAspectRatioChange('portrait-9-16')}
              className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide transition-colors ${
                aspectRatioMode === 'portrait-9-16'
                  ? 'bg-gradient-to-r from-amber-400 to-yellow-400 text-black shadow-md shadow-amber-400/30'
                  : 'text-white/75 hover:text-white'
              }`}
            >
              9:16 Crop
            </button>
            <button
              onClick={handleToggleFitMode}
              className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide transition-colors ${
                fitMode === 'contain'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40'
                  : 'text-white/75 hover:text-white'
              }`}
            >
              {fitMode === 'contain' ? 'Fit View' : 'Fill Screen'}
            </button>
          </div>

          {/* Bottom Floating Control Bar */}
          <footer className="absolute bottom-0 inset-x-0 pb-[max(1.5rem,env(safe-area-inset-bottom))] px-5 sm:px-8 pt-2 flex items-center justify-around z-30 max-w-lg mx-auto">
            <button
              onClick={handleToggleMirror}
              className={`p-3.5 rounded-full glass-panel border transition-colors ${
                isMirrored ? 'text-amber-400 border-amber-400/40' : 'text-white/70 border-white/10 hover:text-white'
              }`}
              title="Flip Mirror Mode"
            >
              <FlipHorizontal className="w-5 h-5" />
            </button>

            <div className="relative group flex items-center justify-center">
              {isRecording ? (
                <button
                  onClick={stopRecording}
                  className="w-20 h-20 rounded-full border-4 border-red-500 bg-red-600/80 hover:bg-red-600 flex items-center justify-center text-white shadow-[0_0_30px_rgba(239,68,68,0.6)] active:scale-95 transition-transform"
                  title="Stop Recording"
                >
                  <Square className="w-8 h-8 fill-current" />
                </button>
              ) : (
                <button
                  onClick={startRecording}
                  className="w-20 h-20 rounded-full p-1 border-4 border-amber-400 bg-black/40 hover:scale-105 active:scale-95 transition-transform shadow-[0_0_35px_rgba(255,215,0,0.4)] flex items-center justify-center"
                  title="Record Clip (TikTok 9:16)"
                >
                  <div className="w-full h-full rounded-full bg-gradient-to-tr from-amber-500 via-yellow-400 to-amber-500 flex items-center justify-center text-black font-black">
                    <Video className="w-8 h-8 fill-black" />
                  </div>
                </button>
              )}
            </div>

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
                onClick={handleOpenGuide}
                className="p-3.5 rounded-full glass-panel text-amber-400 border border-amber-500/30 transition-transform hover:scale-105"
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

          <div className="flex flex-wrap justify-center gap-2 mb-8 max-w-sm">
            {SUPPORTED_POSE_CHIPS.map((pose) => (
              <span
                key={pose}
                className="px-3 py-1 rounded-full bg-white/[0.06] border border-white/10 text-[11px] font-semibold text-amber-200/90"
              >
                ✨ {pose}
              </span>
            ))}
          </div>

          {cameraError && (
            <div className="w-full mb-6 p-3.5 rounded-xl bg-red-900/40 border border-red-500/50 text-red-200 text-xs sm:text-sm">
              {cameraError}
            </div>
          )}

          <button
            onClick={startCamera}
            className="w-full max-w-xs py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-black font-cinzel font-black text-base tracking-wider uppercase shadow-[0_0_35px_rgba(255,215,0,0.45)] hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
          >
            <Camera className="w-6 h-6 fill-current" />
            Start Camera & Aura
          </button>

          <button
            onClick={handleOpenGuide}
            className="mt-4 text-xs text-white/60 hover:text-amber-300 flex items-center gap-1.5 transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            How to strike the 4 gym poses
          </button>
        </main>
      )}

      {/* Lazy-Loaded Drawers & Modals */}
      <Suspense fallback={null}>
        {isControlsOpen && (
          <ControlsDrawer
            isOpen={isControlsOpen}
            onClose={handleCloseControls}
            bloomIntensity={bloomIntensity}
            onBloomChange={setBloomIntensity}
            audioVolume={audioVolume}
            onVolumeChange={setAudioVolume}
            isMuted={isMuted}
            onMuteToggle={handleToggleMute}
            poseSensitivity={poseSensitivity}
            onSensitivityChange={setPoseSensitivity}
            isMirrored={isMirrored}
            onMirrorToggle={handleToggleMirror}
            onSwitchCamera={switchCamera}
            hasMultipleCameras={availableCameras.length > 1}
            showSkeleton={showSkeleton}
            onSkeletonToggle={handleToggleSkeleton}
            onOpenGuide={handleOpenGuide}
            forceFilter={forceFilter}
            onToggleForceFilter={handleToggleForceFilter}
            fitMode={fitMode}
            onFitModeToggle={handleToggleFitMode}
            cameraZoom={cameraZoom}
            onCameraZoomChange={setCameraZoom}
            availableCameras={availableCameras}
            selectedDeviceId={selectedDeviceId}
            onSelectCamera={handleSelectCamera}
            aspectRatioMode={aspectRatioMode}
            onAspectRatioChange={handleAspectRatioChange}
            cameraResolution={cameraResolution}
          />
        )}

        {isGuideOpen && (
          <PoseGuideModal
            isOpen={isGuideOpen}
            onClose={handleCloseGuide}
          />
        )}

        {isRecordModalOpen && (
          <RecordModal
            isOpen={isRecordModalOpen}
            onClose={handleCloseRecordModal}
            videoUrl={recordedVideoUrl}
            videoBlob={recordedBlob}
          />
        )}
      </Suspense>
    </div>
  );
};

export default App;
