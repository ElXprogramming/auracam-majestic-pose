import { FilesetResolver, PoseLandmarker, PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import { NormalizedLandmark } from './poseClassifier';

export class PoseDetectorService {
  private poseLandmarker: PoseLandmarker | null = null;
  private isInitializing: boolean = false;
  private lastDetectTimeMs: number = 0;
  private cachedLandmarks: NormalizedLandmark[] | null = null;
  public statusMessage: string = 'AI Vision initializing...';
  public initError: string | null = null;

  public async init(): Promise<void> {
    if (this.poseLandmarker || this.isInitializing) return;
    this.isInitializing = true;
    this.initError = null;

    try {
      console.log('✨ [PoseDetector] Resolving vision tasks wasm...');
      this.statusMessage = 'Loading WebAssembly vision engine...';

      // Resolve wasm using CDN or local path
      let vision;
      const wasmUrls = [
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
        `${window.location.origin}/wasm`,
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
        '/models/pose_landmarker_lite.task',
        `${window.location.origin}/models/pose_landmarker_lite.task`,
        'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'
      ];

      // Try GPU delegate first, fallback to CPU delegate
      let landmarker: PoseLandmarker | null = null;

      for (const modelPath of modelPaths) {
        try {
          console.log(`[PoseDetector] Trying model from: ${modelPath} (GPU)`);
          landmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: modelPath,
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numPoses: 1,
            minPoseDetectionConfidence: 0.45,
            minPosePresenceConfidence: 0.45,
            minTrackingConfidence: 0.45,
          });
          if (landmarker) break;
        } catch (gpuErr) {
          console.warn(`[PoseDetector] GPU model init failed for ${modelPath}, trying CPU...`, gpuErr);
          try {
            landmarker = await PoseLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: modelPath,
                delegate: 'CPU',
              },
              runningMode: 'VIDEO',
              numPoses: 1,
              minPoseDetectionConfidence: 0.45,
              minPosePresenceConfidence: 0.45,
              minTrackingConfidence: 0.45,
            });
            if (landmarker) break;
          } catch (cpuErr) {
            console.warn(`[PoseDetector] CPU model init failed for ${modelPath}`, cpuErr);
          }
        }
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
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Run pose detection throttled to ~30 FPS (every 33ms)
   * Avoids depending on video.currentTime which stays 0 on live WebRTC in mobile Safari!
   */
  public detectPose(video: HTMLVideoElement, timestampMs: number): NormalizedLandmark[] | null {
    if (!this.poseLandmarker || video.readyState < 2) {
      return this.cachedLandmarks;
    }

    // Throttle to every 30ms (~33fps) to avoid saturating mobile CPU/GPU
    if (timestampMs - this.lastDetectTimeMs >= 30) {
      this.lastDetectTimeMs = timestampMs;
      try {
        const result: PoseLandmarkerResult = this.poseLandmarker.detectForVideo(video, timestampMs);
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
