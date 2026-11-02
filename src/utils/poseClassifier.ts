export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export type PoseType = 
  | 'Front Double Bicep'
  | 'Zyzz / Archer Pose'
  | 'Lat Spread'
  | 'Any Flex';

export interface PoseDetectionResult {
  detectedPose: PoseType | null;
  confidence: number;
  rawPose: PoseType | null;
  details?: string;
}

// Helper: Calculate 2D angle between three points A -> B -> C with vertex at B
export function calculateAngle(
  a: NormalizedLandmark,
  b: NormalizedLandmark,
  c: NormalizedLandmark
): number {
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  if (angle > 180.0) {
    angle = 360.0 - angle;
  }
  return angle;
}

// Distance between two points
export function distance2D(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Landmark index mappings according to BlazePose
export const LM = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
};

/**
 * Classify single frame pose geometry
 * @param landmarks 33 landmarks from PoseLandmarker
 * @param sensitivity 0.5 (strict) to 1.5 (lenient), default 1.0
 */
export function classifyPoseGeometry(
  landmarks: NormalizedLandmark[],
  sensitivity: number = 1.0
): { pose: PoseType | null; confidence: number } {
  if (!landmarks || landmarks.length < 25) {
    return { pose: null, confidence: 0 };
  }

  const lShoulder = landmarks[LM.LEFT_SHOULDER];
  const rShoulder = landmarks[LM.RIGHT_SHOULDER];
  const lElbow = landmarks[LM.LEFT_ELBOW];
  const rElbow = landmarks[LM.RIGHT_ELBOW];
  const lWrist = landmarks[LM.LEFT_WRIST];
  const rWrist = landmarks[LM.RIGHT_WRIST];
  const lHip = landmarks[LM.LEFT_HIP];
  const rHip = landmarks[LM.RIGHT_HIP];
  const nose = landmarks[LM.NOSE];

  // Basic visibility check
  const minVis = 0.45;
  const upperBodyVisible = 
    (lShoulder.visibility ?? 1) > minVis &&
    (rShoulder.visibility ?? 1) > minVis &&
    (lElbow.visibility ?? 1) > minVis &&
    (rElbow.visibility ?? 1) > minVis &&
    (lWrist.visibility ?? 1) > minVis &&
    (rWrist.visibility ?? 1) > minVis;

  if (!upperBodyVisible) {
    return { pose: null, confidence: 0 };
  }

  const shoulderWidth = distance2D(lShoulder, rShoulder);
  if (shoulderWidth < 0.05) {
    return { pose: null, confidence: 0 };
  }

  // Calculate elbow flexion angles
  const lElbowAngle = calculateAngle(lShoulder, lElbow, lWrist);
  const rElbowAngle = calculateAngle(rShoulder, rElbow, rWrist);

  // Tolerance margin based on sensitivity
  // Sensitivity 1.0 -> standard, 1.2 -> wider tolerance
  const angleTolerance = 25 * sensitivity;

  // 1) Front Double Bicep
  // - Both elbows at shoulder level (+/- shoulderWidth * 0.45)
  // - Arms flexed 70°-110° (with tolerance)
  // - Wrists above elbows (y is inverted in screen space: wrist.y < elbow.y)
  const lElbowAtShoulder = Math.abs(lElbow.y - lShoulder.y) < shoulderWidth * (0.42 * sensitivity);
  const rElbowAtShoulder = Math.abs(rElbow.y - rShoulder.y) < shoulderWidth * (0.42 * sensitivity);

  const minBicepAngle = Math.max(50, 70 - angleTolerance);
  const maxBicepAngle = Math.min(130, 110 + angleTolerance);

  const lArmFlexed = lElbowAngle >= minBicepAngle && lElbowAngle <= maxBicepAngle;
  const rArmFlexed = rElbowAngle >= minBicepAngle && rElbowAngle <= maxBicepAngle;

  const lWristAboveElbow = lWrist.y <= lElbow.y + 0.04;
  const rWristAboveElbow = rWrist.y <= rElbow.y + 0.04;

  if (
    lElbowAtShoulder &&
    rElbowAtShoulder &&
    lArmFlexed &&
    rArmFlexed &&
    lWristAboveElbow &&
    rWristAboveElbow
  ) {
    return { pose: 'Front Double Bicep', confidence: 0.95 };
  }

  // 2) Zyzz / Archer Pose
  // - One arm straight out (elbow angle > 145°), pointing outward
  // - Opposite arm flexed behind or near head (elbow angle < 115°, wrist near head or above shoulder)
  const straightThreshold = Math.max(130, 150 - angleTolerance);
  const headFlexThreshold = Math.min(125, 105 + angleTolerance);

  // Scenario A: Left arm straight out, Right arm flexed behind head
  const lStraightOut = lElbowAngle >= straightThreshold && distance2D(lWrist, lShoulder) > shoulderWidth * 0.75;
  const rFlexedHead = rElbowAngle <= headFlexThreshold && (rWrist.y < rShoulder.y || distance2D(rWrist, nose) < shoulderWidth * 0.9);

  // Scenario B: Right arm straight out, Left arm flexed behind head
  const rStraightOut = rElbowAngle >= straightThreshold && distance2D(rWrist, rShoulder) > shoulderWidth * 0.75;
  const lFlexedHead = lElbowAngle <= headFlexThreshold && (lWrist.y < lShoulder.y || distance2D(lWrist, nose) < shoulderWidth * 0.9);

  if ((lStraightOut && rFlexedHead) || (rStraightOut && lFlexedHead)) {
    return { pose: 'Zyzz / Archer Pose', confidence: 0.92 };
  }

  // 3) Lat Spread
  // - Hands/wrists placed on hips or waist level
  // - Elbows flared wide: distance between elbows significantly greater than shoulder width
  const lWristNearHip = Math.abs(lWrist.y - lHip.y) < shoulderWidth * (0.6 * sensitivity) || Math.abs(lWrist.y - lShoulder.y) > shoulderWidth * 0.8;
  const rWristNearHip = Math.abs(rWrist.y - rHip.y) < shoulderWidth * (0.6 * sensitivity) || Math.abs(rWrist.y - rShoulder.y) > shoulderWidth * 0.8;

  const elbowSpan = distance2D(lElbow, rElbow);
  const elbowsFlaredWide = elbowSpan > shoulderWidth * (1.45 / sensitivity);
  const lElbowBent = lElbowAngle >= 55 && lElbowAngle <= 135;
  const rElbowBent = rElbowAngle >= 55 && rElbowAngle <= 135;

  if (lWristNearHip && rWristNearHip && elbowsFlaredWide && lElbowBent && rElbowBent) {
    return { pose: 'Lat Spread', confidence: 0.88 };
  }

  // 4) Any Flex
  // - Wrist above shoulder with elbow flexed (< 120°)
  const anyFlexLeft = lWrist.y < lShoulder.y && lElbowAngle >= 45 && lElbowAngle <= (120 + angleTolerance * 0.5);
  const anyFlexRight = rWrist.y < rShoulder.y && rElbowAngle >= 45 && rElbowAngle <= (120 + angleTolerance * 0.5);

  if (anyFlexLeft || anyFlexRight) {
    return { pose: 'Any Flex', confidence: 0.82 };
  }

  return { pose: null, confidence: 0 };
}

/**
 * PoseDebouncer manages 250ms debouncing logic
 */
export class PoseDebouncer {
  private currentPose: PoseType | null = null;
  private candidatePose: PoseType | null = null;
  private candidateStartTime: number = 0;
  private releaseStartTime: number = 0;
  private debounceMs: number;
  private releaseToleranceMs: number;

  constructor(debounceMs: number = 250, releaseToleranceMs: number = 280) {
    this.debounceMs = debounceMs;
    this.releaseToleranceMs = releaseToleranceMs;
  }

  public update(rawPose: PoseType | null, now: number = performance.now()): PoseDetectionResult {
    if (rawPose) {
      this.releaseStartTime = 0; // reset release timer
      if (rawPose === this.currentPose) {
        // Holding current pose
        this.candidatePose = null;
        return {
          detectedPose: this.currentPose,
          confidence: 1.0,
          rawPose
        };
      }

      if (rawPose === this.candidatePose) {
        if (now - this.candidateStartTime >= this.debounceMs) {
          this.currentPose = rawPose;
          this.candidatePose = null;
        }
      } else {
        // New candidate
        this.candidatePose = rawPose;
        this.candidateStartTime = now;
      }
    } else {
      // No raw pose detected in this frame
      this.candidatePose = null;
      if (this.currentPose) {
        if (this.releaseStartTime === 0) {
          this.releaseStartTime = now;
        } else if (now - this.releaseStartTime >= this.releaseToleranceMs) {
          this.currentPose = null;
          this.releaseStartTime = 0;
        }
      }
    }

    return {
      detectedPose: this.currentPose,
      confidence: this.currentPose ? 1.0 : 0.0,
      rawPose
    };
  }

  public reset() {
    this.currentPose = null;
    this.candidatePose = null;
    this.candidateStartTime = 0;
    this.releaseStartTime = 0;
  }

  public getActivePose(): PoseType | null {
    return this.currentPose;
  }
}
