import {
  FilesetResolver,
  PoseLandmarker,
  PoseLandmarkerResult,
  GestureRecognizer,
  GestureRecognizerResult,
} from '@mediapipe/tasks-vision';
import { NormalizedLandmark } from './poseClassifier';
import { isIOS } from './deviceUtils';

/**
 * Geometric check for Peace Sign (V-sign ✌️) from 21 hand landmarks:
 * Index (8) and Middle (12) are extended; Ring (16) and Pinky (20) are curled.
 */
export function isHandPeaceSign(lm: NormalizedLandmark[]): boolean {
  if (!lm || lm.length < 21) return false;

  const wrist = lm[0];
  const dist = (p1: NormalizedLandmark, p2: NormalizedLandmark) => {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // 1. Index finger extended: tip (8) is further from wrist (0) than PIP (6)
  const indexExtended = dist(wrist, lm[8]) > dist(wrist, lm[6]) * 1.15;

  // 2. Middle finger extended: tip (12) is further from wrist (0) than PIP (10)
  const middleExtended = dist(wrist, lm[12]) > dist(wrist, lm[10]) * 1.15;

  // 3. Ring finger curled: tip (16) is closer to wrist than PIP (14)
  const ringCurled = dist(wrist, lm[16]) < dist(wrist, lm[14]) * 1.15;

  // 4. Pinky finger curled: tip (20) is closer to wrist than PIP (18)
  const pinkyCurled = dist(wrist, lm[20]) < dist(wrist, lm[18]) * 1.15;

  // 5. Index & Middle tips separated (V-shape)
  const vSeparation = dist(lm[8], lm[12]) > dist(lm[5], lm[9]) * 0.75;

  return indexExtended && middleExtended && ringCurled && pinkyCurled && vSeparation;
}

export class PoseDetectorService {
  private static instance: PoseDetectorService | null = null;
  private poseLandmarker: PoseLandmarker | null = null;
  private gestureRecognizer: GestureRecognizer | null = null;
  private initPromise: Promise<void> | null = null;
  private lastDetectTimeMs: number = 0;
  private lastGestureTimeMs: number = 0;
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

      // Initialize GestureRecognizer for hands-free Peace Sign (Victory ✌️) activation/termination
      const gestureModelPaths = [
        '/models/gesture_recognizer.task',
        `${window.location.origin}/models/gesture_recognizer.task`,
        'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
      ];

      for (const gPath of gestureModelPaths) {
        for (const delegate of preferredDelegates) {
          try {
            console.log(`[PoseDetector] Trying gesture recognizer from: ${gPath} (${delegate} delegate)`);
            const recognizer = await GestureRecognizer.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: gPath,
                delegate: delegate,
              },
              runningMode: 'VIDEO',
              numHands: 2,
              minHandDetectionConfidence: 0.45,
              minHandPresenceConfidence: 0.45,
              minTrackingConfidence: 0.45,
            });
            if (recognizer) {
              this.gestureRecognizer = recognizer;
              console.log(`[PoseDetector] GestureRecognizer loaded successfully with ${delegate} delegate.`);
              break;
            }
          } catch (gErr) {
            console.warn(`[PoseDetector] GestureRecognizer init failed for ${gPath} (${delegate}):`, gErr);
          }
        }
        if (this.gestureRecognizer) break;
      }

      this.statusMessage = 'AI Vision Active';
      console.log('✨ [PoseDetector] PoseLandmarker and GestureRecognizer are ready and active!');
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

  /**
   * Detect gestures (specifically Peace Sign ✌️) throttled to ~120ms
   */
  public detectGesture(
    video: HTMLVideoElement,
    timestampMs: number
  ): { isPeaceSign: boolean; confidence: number } {
    if (
      !this.gestureRecognizer ||
      video.readyState < 2 ||
      video.videoWidth === 0 ||
      video.videoHeight === 0 ||
      video.paused
    ) {
      return { isPeaceSign: false, confidence: 0 };
    }

    // Adaptive throttle: check gesture every 120ms (mobile) or 90ms (desktop)
    const throttleMs = isIOS() ? 120 : 90;
    if (timestampMs - this.lastGestureTimeMs >= throttleMs) {
      const safeTimestamp = Math.max(Math.round(timestampMs), this.lastGestureTimeMs + 1);
      this.lastGestureTimeMs = safeTimestamp;

      try {
        const result: GestureRecognizerResult = this.gestureRecognizer.recognizeForVideo(video, safeTimestamp);

        if (result.gestures && result.gestures.length > 0) {
          for (let i = 0; i < result.gestures.length; i++) {
            const handGestures = result.gestures[i];
            if (handGestures && handGestures.length > 0) {
              const top = handGestures[0];
              const name = top.categoryName;
              const score = top.score;

              // MediaPipe's trained class for Peace Sign is 'Victory'
              if (
                (name === 'Victory' || name.toLowerCase().includes('peace') || name.toLowerCase().includes('victory')) &&
                score > 0.45
              ) {
                return { isPeaceSign: true, confidence: score };
              }

              // Also verify via hand landmark geometry if available
              if (result.landmarks && result.landmarks[i]) {
                const isGeoPeace = isHandPeaceSign(result.landmarks[i] as NormalizedLandmark[]);
                if (isGeoPeace) {
                  return { isPeaceSign: true, confidence: 0.85 };
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn('[PoseDetector] gesture recognition warning:', err);
      }
    }

    return { isPeaceSign: false, confidence: 0 };
  }

  public isReady(): boolean {
    return this.poseLandmarker !== null;
  }

  public close(): void {
    if (this.poseLandmarker) {
      this.poseLandmarker.close();
      this.poseLandmarker = null;
    }
    if (this.gestureRecognizer) {
      this.gestureRecognizer.close();
      this.gestureRecognizer = null;
    }
    this.cachedLandmarks = null;
  }
}
