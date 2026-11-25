import type { PoseLandmarker, PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import { NormalizedLandmark } from './poseClassifier';
import { isIOS } from './deviceUtils';

export class PoseDetectorService {
  private static instance: PoseDetectorService | null = null;
  private poseLandmarker: PoseLandmarker | null = null;
  private initPromise: Promise<void> | null = null;
  private lastDetectTimeMs: number = 0;
  private lastVideoTime: number = -1;
  private cachedLandmarks: NormalizedLandmark[] | null = null;
  private readonly throttleMs: number = isIOS() ? 45 : 30;
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
    // Deduplicate concurrent init calls (e.g. React StrictMode double-mount)
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
      this.statusMessage = 'Loading WebAssembly vision engine...';

      // Dynamically load MediaPipe runtime so initial UI paint is never blocked
      const { FilesetResolver, PoseLandmarker: PoseLandmarkerClass } = await import('@mediapipe/tasks-vision');

      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const wasmUrls = [
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
        `${origin}/wasm`,
        'https://unpkg.com/@mediapipe/tasks-vision@0.10.14/wasm',
      ];

      let vision;
      for (const url of wasmUrls) {
        try {
          vision = await FilesetResolver.forVisionTasks(url);
          if (vision) break;
        } catch (wasmErr) {
          console.warn(`[PoseDetector] Wasm from ${url} failed, trying next...`, wasmErr);
        }
      }

      if (!vision) {
        throw new Error('Failed to resolve MediaPipe WebAssembly fileset from all sources.');
      }

      this.statusMessage = 'Loading neural pose model...';

      const modelPaths = [
        'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
        `${origin}/models/pose_landmarker_lite.task`,
      ];

      // On iOS Safari, CPU delegate (WASM SIMD) avoids Metal/WebGL context contention with the shader canvas
      const preferredDelegates: readonly ('CPU' | 'GPU')[] = isIOS() ? ['CPU', 'GPU'] : ['GPU', 'CPU'];

      let landmarker: PoseLandmarker | null = null;

      for (const modelPath of modelPaths) {
        for (const delegate of preferredDelegates) {
          try {
            landmarker = await PoseLandmarkerClass.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: modelPath,
                delegate,
              },
              runningMode: 'VIDEO',
              numPoses: 1,
              minPoseDetectionConfidence: 0.45,
              minPosePresenceConfidence: 0.45,
              minTrackingConfidence: 0.45,
            });
            if (landmarker) break;
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
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[PoseDetector] Init failure:', errorMsg);
      this.initError = errorMsg;
      this.statusMessage = `AI Vision Error: ${errorMsg}`;
      throw err;
    }
  }

  /**
   * Run pose detection throttled for mobile responsiveness and skipped when camera frame hasn't advanced
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

    const vt = video.currentTime;
    const isNewFrame = vt <= 0 || vt !== this.lastVideoTime;

    if (isNewFrame && timestampMs - this.lastDetectTimeMs >= this.throttleMs) {
      this.lastVideoTime = vt;
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
    this.lastVideoTime = -1;
  }
}
