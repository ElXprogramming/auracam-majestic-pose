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
 * @param sensitivity 0.6 (strict) to 1.5 (lenient), default 1.0
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

  // Minimum visibility threshold
  const minVis = 0.25;
  const isVis = (lm?: NormalizedLandmark) => !lm || (lm.visibility ?? 1.0) > minVis;

  const shoulderWidth = distance2D(lShoulder, rShoulder);
  if (shoulderWidth < 0.04) {
    return { pose: null, confidence: 0 };
  }

  // Calculate elbow flexion angles
  const lElbowAngle = calculateAngle(lShoulder, lElbow, lWrist);
  const rElbowAngle = calculateAngle(rShoulder, rElbow, rWrist);

  // Tolerance margin based on sensitivity
  const angleTolerance = 25 * sensitivity;

  // 1) Front Double Bicep
  // - Both elbows elevated near or above chest level
  // - Both arms flexed (50°-130°)
  // - Wrists roughly at or above elbows
  const bothShouldersVis = isVis(lShoulder) && isVis(rShoulder);
  const bothArmsVis = isVis(lElbow) && isVis(rElbow) && isVis(lWrist) && isVis(rWrist);

  if (bothShouldersVis && bothArmsVis) {
    const lElbowUp = lElbow.y < lShoulder.y + shoulderWidth * (0.45 * sensitivity);
    const rElbowUp = rElbow.y < rShoulder.y + shoulderWidth * (0.45 * sensitivity);

    const minBicep = Math.max(45, 65 - angleTolerance);
    const maxBicep = Math.min(135, 115 + angleTolerance);

    const lFlexed = lElbowAngle >= minBicep && lElbowAngle <= maxBicep;
    const rFlexed = rElbowAngle >= minBicep && rElbowAngle <= maxBicep;

    const lWristUp = lWrist.y <= lElbow.y + 0.08;
    const rWristUp = rWrist.y <= rElbow.y + 0.08;

    if (lElbowUp && rElbowUp && lFlexed && rFlexed && lWristUp && rWristUp) {
      return { pose: 'Front Double Bicep', confidence: 0.95 };
    }
  }

  // 2) Zyzz / Archer Pose
  // - One arm extended straight out (elbow angle > 135°)
  // - Opposite arm flexed behind or near head (elbow angle < 125°, wrist near head or elevated)
  const straightThreshold = Math.max(125, 145 - angleTolerance);
  const headFlexThreshold = Math.min(130, 115 + angleTolerance);

  // Scenario A: Left arm straight out, Right arm flexed behind head
  if (isVis(lShoulder) && isVis(lElbow) && isVis(lWrist) && isVis(rElbow) && isVis(rWrist)) {
    const lStraightOut = lElbowAngle >= straightThreshold && distance2D(lWrist, lShoulder) > shoulderWidth * 0.7;
    const rFlexedHead = rElbowAngle <= headFlexThreshold && (rWrist.y < rShoulder.y + 0.05 || distance2D(rWrist, nose) < shoulderWidth * 1.0);

    if (lStraightOut && rFlexedHead) {
      return { pose: 'Zyzz / Archer Pose', confidence: 0.92 };
    }
  }

  // Scenario B: Right arm straight out, Left arm flexed behind head
  if (isVis(rShoulder) && isVis(rElbow) && isVis(rWrist) && isVis(lElbow) && isVis(lWrist)) {
    const rStraightOut = rElbowAngle >= straightThreshold && distance2D(rWrist, rShoulder) > shoulderWidth * 0.7;
    const lFlexedHead = lElbowAngle <= headFlexThreshold && (lWrist.y < lShoulder.y + 0.05 || distance2D(lWrist, nose) < shoulderWidth * 1.0);

    if (rStraightOut && lFlexedHead) {
      return { pose: 'Zyzz / Archer Pose', confidence: 0.92 };
    }
  }

  // 3) Lat Spread
  // - Hands/wrists placed on hips or waist level
  // - Elbows flared wide
  if (isVis(lElbow) && isVis(rElbow) && isVis(lShoulder) && isVis(rShoulder)) {
    const lWristNearHip = isVis(lWrist) ? (Math.abs(lWrist.y - lHip.y) < shoulderWidth * (0.7 * sensitivity) || lWrist.y > lShoulder.y + shoulderWidth * 0.3) : true;
    const rWristNearHip = isVis(rWrist) ? (Math.abs(rWrist.y - rHip.y) < shoulderWidth * (0.7 * sensitivity) || rWrist.y > rShoulder.y + shoulderWidth * 0.3) : true;

    const elbowSpan = distance2D(lElbow, rElbow);
    const elbowsFlaredWide = elbowSpan > shoulderWidth * (1.35 / sensitivity);
    const lElbowBent = lElbowAngle >= 45 && lElbowAngle <= 145;
    const rElbowBent = rElbowAngle >= 45 && rElbowAngle <= 145;

    if (lWristNearHip && rWristNearHip && elbowsFlaredWide && lElbowBent && rElbowBent) {
      return { pose: 'Lat Spread', confidence: 0.88 };
    }
  }

  // 4) Any Flex (Easiest & most intuitive to trigger!)
  // - At least one arm with wrist elevated near/above shoulder and elbow flexed
  const leftArmFlex = 
    isVis(lShoulder) && isVis(lElbow) && isVis(lWrist) &&
    lWrist.y < (lShoulder.y + shoulderWidth * 0.25) &&
    lElbowAngle >= 35 && lElbowAngle <= (125 + angleTolerance * 0.5);

  const rightArmFlex = 
    isVis(rShoulder) && isVis(rElbow) && isVis(rWrist) &&
    rWrist.y < (rShoulder.y + shoulderWidth * 0.25) &&
    rElbowAngle >= 35 && rElbowAngle <= (125 + angleTolerance * 0.5);

  if (leftArmFlex || rightArmFlex) {
    return { pose: 'Any Flex', confidence: 0.85 };
  }

  return { pose: null, confidence: 0 };
}

/**
 * PoseDebouncer manages robust 250ms debouncing logic with dropped frame tolerance
 */
export class PoseDebouncer {
  private currentPose: PoseType | null = null;
  private candidatePose: PoseType | null = null;
  private candidateStartTime: number = 0;
  private missedFrames: number = 0;
  private maxMissedFrames: number = 6; // Allow up to 6 dropped frames (~120ms) without resetting candidate
  private releaseStartTime: number = 0;
  private debounceMs: number;
  private releaseToleranceMs: number;

  constructor(debounceMs: number = 250, releaseToleranceMs: number = 400) {
    this.debounceMs = debounceMs;
    this.releaseToleranceMs = releaseToleranceMs;
  }

  public update(rawPose: PoseType | null, now: number = performance.now()): PoseDetectionResult {
    if (rawPose) {
      this.releaseStartTime = 0; // reset release timer
      this.missedFrames = 0;

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
        // New candidate pose
        this.candidatePose = rawPose;
        this.candidateStartTime = now;
      }
    } else {
      // Raw pose was not detected in this frame
      this.missedFrames++;

      // Only cancel candidate if consistently missing for more than maxMissedFrames
      if (this.missedFrames > this.maxMissedFrames) {
        this.candidatePose = null;
      }

      // Handle release of currently active pose
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
    this.missedFrames = 0;
  }

  public getActivePose(): PoseType | null {
    return this.currentPose;
  }
}
