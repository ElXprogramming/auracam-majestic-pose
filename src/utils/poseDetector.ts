import { FilesetResolver, PoseLandmarker, PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import { NormalizedLandmark } from './poseClassifier';

export class PoseDetectorService {
  private poseLandmarker: PoseLandmarker | null = null;
  private isInitializing: boolean = false;
  private lastVideoTime: number = -1;

  public async init(): Promise<void> {
    if (this.poseLandmarker || this.isInitializing) return;
    this.isInitializing = true;

    try {
      console.log('Initializing MediaPipe PoseLandmarker...');
      // Try local wasm first, fallback to CDN
      let vision;
      try {
        vision = await FilesetResolver.forVisionTasks('/wasm');
      } catch (e) {
        console.warn('Local wasm failed, falling back to CDN:', e);
        vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
        );
      }

      // Try GPU delegate first, fallback to CPU
      try {
        this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/models/pose_landmarker_lite.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      } catch (gpuErr) {
        console.warn('GPU delegate failed, initializing with CPU delegate:', gpuErr);
        this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/models/pose_landmarker_lite.task',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      }

      console.log('PoseLandmarker ready!');
    } catch (err) {
      console.error('Failed to initialize PoseLandmarker:', err);
      throw err;
    } finally {
      this.isInitializing = false;
    }
  }

  public detectPose(video: HTMLVideoElement, timestampMs: number): NormalizedLandmark[] | null {
    if (!this.poseLandmarker || video.readyState < 2) return null;

    if (video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = video.currentTime;
      try {
        const result: PoseLandmarkerResult = this.poseLandmarker.detectForVideo(video, timestampMs);
        if (result.landmarks && result.landmarks.length > 0) {
          return result.landmarks[0] as NormalizedLandmark[];
        }
      } catch (err) {
        console.warn('Pose detection error:', err);
      }
    }
    return null;
  }

  public isReady(): boolean {
    return this.poseLandmarker !== null;
  }

  public close(): void {
    if (this.poseLandmarker) {
      this.poseLandmarker.close();
      this.poseLandmarker = null;
    }
  }
}
