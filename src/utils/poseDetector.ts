import { FilesetResolver, PoseLandmarker, PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import { NormalizedLandmark } from './poseClassifier';
import { isIOS } from './deviceUtils';

export class PoseDetectorService {
  private static instance: PoseDetectorService | null = null;
  private poseLandmarker: PoseLandmarker | null = null;
  private initPromise: Promise<void> | null = null;
  private lastDetectTimeMs: number = 0;
  private cachedLandmarks: NormalizedLandmark[] | null = null;
  public statusMessage: string = 'AI Vision initializing...';
  public initError: string | null = null;

  public static getInstance(): PoseDetectorService {
    if (!PoseDetectorService.instance) {
      PoseDetectorService.instance = new PoseDetectorService();
    }
    return PoseDetectorService.instance;
  }

  public async init(): Promise<void> {
    if (this.poseLandmarker) {
      return;
    }
    // If an initialization is already in flight (e.g. StrictMode double-mount or rapid re-renders),
    // wait for it rather than returning early or creating a competing instance!
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initError = null;
    this.initPromise = this.doInit();

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async doInit(): Promise<void> {
    try {
      console.log('✨ [PoseDetector] Resolving vision tasks wasm...');
      this.statusMessage = 'Loading WebAssembly vision engine...';

      // Use jsDelivr CDN as primary: standard Google MediaPipe host with guaranteed correct MIME types,
      // then fall back to local origin and unpkg
      let vision;
      const wasmUrls = [
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
        `${window.location.origin}/wasm`,
        '/wasm',
        'https://unpkg.com/@mediapipe/tasks-vision@0.10.14/wasm'
      ];

      for (const url of wasmUrls) {
        try {
          console.log(`[PoseDetector] Trying wasm from: ${url}`);
          vision = await FilesetResolver.forVisionTasks(url);
          if (vision) break;
        } catch (wasmErr) {
          console.warn(`[PoseDetector] Wasm from ${url} failed, trying next...`, wasmErr);
        }
      }

      if (!vision) {
        throw new Error('Failed to resolve MediaPipe WebAssembly fileset from all sources.');
      }

      console.log('✨ [PoseDetector] Wasm fileset resolved. Loading pose model...');
      this.statusMessage = 'Loading neural pose model...';

      const modelPaths = [
        'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
        '/models/pose_landmarker_lite.task',
        `${window.location.origin}/models/pose_landmarker_lite.task`
      ];

      // CRITICAL FOR IOS/IPAD: On iOS Safari, WebGL inside WebAssembly (GPU delegate) frequently
      // crashes Metal shader compiler or causes WebGL context loss when sharing with the camera canvas.
      // CPU delegate (WASM SIMD) is rock-solid, ultra-fast, and avoids GPU process crashes on Apple devices.
      const isApple = isIOS();
      const preferredDelegates: Array<'CPU' | 'GPU'> = isApple ? ['CPU', 'GPU'] : ['GPU', 'CPU'];

      let landmarker: PoseLandmarker | null = null;

      for (const modelPath of modelPaths) {
        for (const delegate of preferredDelegates) {
          try {
            console.log(`[PoseDetector] Trying model from: ${modelPath} (${delegate} delegate)`);
            landmarker = await PoseLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: modelPath,
                delegate: delegate,
              },
              runningMode: 'VIDEO',
              numPoses: 1,
              minPoseDetectionConfidence: 0.45,
              minPosePresenceConfidence: 0.45,
              minTrackingConfidence: 0.45,
            });
            if (landmarker) {
              console.log(`[PoseDetector] Model loaded successfully with ${delegate} delegate.`);
              break;
            }
          } catch (delErr) {
            console.warn(`[PoseDetector] Model init failed for ${modelPath} (${delegate}):`, delErr);
          }
        }
        if (landmarker) break;
      }

      if (!landmarker) {
        throw new Error('Failed to create PoseLandmarker with GPU or CPU delegates.');
      }

      this.poseLandmarker = landmarker;
      this.statusMessage = 'AI Vision Active';
      console.log('✨ [PoseDetector] PoseLandmarker is ready and active!');
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[PoseDetector] Init failure:', errorMsg);
      this.initError = errorMsg;
      this.statusMessage = `AI Vision Error: ${errorMsg}`;
      throw err;
    }
  }

  /**
   * Run pose detection throttled for mobile responsiveness
   * iOS devices use ~45ms (~22 FPS) to eliminate thermal throttling and UI stutter
   */
  public detectPose(video: HTMLVideoElement, timestampMs: number): NormalizedLandmark[] | null {
    if (
      !this.poseLandmarker ||
      video.readyState < 2 ||
      video.videoWidth === 0 ||
      video.videoHeight === 0 ||
      video.paused
    ) {
      return this.cachedLandmarks;
    }

    // Adaptive throttle: 45ms on iOS/mobile to keep 60fps render loop butter-smooth, 30ms on desktop
    const throttleMs = isIOS() ? 45 : 30;
    if (timestampMs - this.lastDetectTimeMs >= throttleMs) {
      // Guarantee strictly monotonically increasing timestamp for MediaPipe WASM
      const safeTimestamp = Math.max(Math.round(timestampMs), this.lastDetectTimeMs + 1);
      this.lastDetectTimeMs = safeTimestamp;

      try {
        const result: PoseLandmarkerResult = this.poseLandmarker.detectForVideo(video, safeTimestamp);
        if (result.landmarks && result.landmarks.length > 0 && result.landmarks[0].length > 0) {
          this.cachedLandmarks = result.landmarks[0] as NormalizedLandmark[];
        } else {
          this.cachedLandmarks = null;
        }
      } catch (err) {
        console.warn('[PoseDetector] detectForVideo warning:', err);
      }
    }

    return this.cachedLandmarks;
  }

  public isReady(): boolean {
    return this.poseLandmarker !== null;
  }

  public close(): void {
    if (this.poseLandmarker) {
      this.poseLandmarker.close();
      this.poseLandmarker = null;
    }
    this.cachedLandmarks = null;
  }
}
