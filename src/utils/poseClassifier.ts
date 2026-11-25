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

const RAD_TO_DEG = 180.0 / Math.PI;
const MIN_VISIBILITY = 0.25;

// Helper: Calculate 2D angle between three points A -> B -> C with vertex at B
export function calculateAngle(
  a: NormalizedLandmark,
  b: NormalizedLandmark,
  c: NormalizedLandmark
): number {
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs(radians * RAD_TO_DEG);
  if (angle > 180.0) {
    angle = 360.0 - angle;
  }
  return angle;
}

// Squared 2D distance (avoids Math.sqrt when comparing thresholds)
function distance2DSq(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

// Distance between two points
export function distance2D(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.sqrt(distance2DSq(a, b));
}

function isVis(lm?: NormalizedLandmark): boolean {
  return !lm || (lm.visibility ?? 1.0) > MIN_VISIBILITY;
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
} as const;

const NO_POSE_RESULT: { pose: PoseType | null; confidence: number } = { pose: null, confidence: 0 };

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
    return NO_POSE_RESULT;
  }

  const lShoulder = landmarks[LM.LEFT_SHOULDER];
  const rShoulder = landmarks[LM.RIGHT_SHOULDER];
  const shoulderWidthSq = distance2DSq(lShoulder, rShoulder);
  if (shoulderWidthSq < 0.0016) {
    // shoulderWidth < 0.04
    return NO_POSE_RESULT;
  }

  const shoulderWidth = Math.sqrt(shoulderWidthSq);
  const lElbow = landmarks[LM.LEFT_ELBOW];
  const rElbow = landmarks[LM.RIGHT_ELBOW];
  const lWrist = landmarks[LM.LEFT_WRIST];
  const rWrist = landmarks[LM.RIGHT_WRIST];
  const lHip = landmarks[LM.LEFT_HIP];
  const rHip = landmarks[LM.RIGHT_HIP];
  const nose = landmarks[LM.NOSE];

  const lShoulderVis = isVis(lShoulder);
  const rShoulderVis = isVis(rShoulder);
  const lElbowVis = isVis(lElbow);
  const rElbowVis = isVis(rElbow);
  const lWristVis = isVis(lWrist);
  const rWristVis = isVis(rWrist);

  // Calculate elbow flexion angles
  const lElbowAngle = calculateAngle(lShoulder, lElbow, lWrist);
  const rElbowAngle = calculateAngle(rShoulder, rElbow, rWrist);

  // Tolerance margin based on sensitivity
  const angleTolerance = 25 * sensitivity;

  // 1) Front Double Bicep
  if (lShoulderVis && rShoulderVis && lElbowVis && rElbowVis && lWristVis && rWristVis) {
    const elbowMargin = shoulderWidth * (0.45 * sensitivity);
    const lElbowUp = lElbow.y < lShoulder.y + elbowMargin;
    const rElbowUp = rElbow.y < rShoulder.y + elbowMargin;

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
  const straightThreshold = Math.max(125, 145 - angleTolerance);
  const headFlexThreshold = Math.min(130, 115 + angleTolerance);
  const reachSqThreshold = shoulderWidthSq * 0.49; // (0.7 * shoulderWidth)^2

  // Scenario A: Left arm straight out, Right arm flexed behind head
  if (lShoulderVis && lElbowVis && lWristVis && rElbowVis && rWristVis) {
    const lStraightOut = lElbowAngle >= straightThreshold && distance2DSq(lWrist, lShoulder) > reachSqThreshold;
    const rFlexedHead =
      rElbowAngle <= headFlexThreshold &&
      (rWrist.y < rShoulder.y + 0.05 || distance2DSq(rWrist, nose) < shoulderWidthSq);

    if (lStraightOut && rFlexedHead) {
      return { pose: 'Zyzz / Archer Pose', confidence: 0.92 };
    }
  }

  // Scenario B: Right arm straight out, Left arm flexed behind head
  if (rShoulderVis && rElbowVis && rWristVis && lElbowVis && lWristVis) {
    const rStraightOut = rElbowAngle >= straightThreshold && distance2DSq(rWrist, rShoulder) > reachSqThreshold;
    const lFlexedHead =
      lElbowAngle <= headFlexThreshold &&
      (lWrist.y < lShoulder.y + 0.05 || distance2DSq(lWrist, nose) < shoulderWidthSq);

    if (rStraightOut && lFlexedHead) {
      return { pose: 'Zyzz / Archer Pose', confidence: 0.92 };
    }
  }

  // 3) Lat Spread
  if (lElbowVis && rElbowVis && lShoulderVis && rShoulderVis) {
    const hipTol = shoulderWidth * (0.7 * sensitivity);
    const shoulderDrop = shoulderWidth * 0.3;
    const lWristNearHip = lWristVis
      ? Math.abs(lWrist.y - lHip.y) < hipTol || lWrist.y > lShoulder.y + shoulderDrop
      : true;
    const rWristNearHip = rWristVis
      ? Math.abs(rWrist.y - rHip.y) < hipTol || rWrist.y > rShoulder.y + shoulderDrop
      : true;

    const flareRatio = 1.35 / sensitivity;
    const elbowsFlaredWide = distance2DSq(lElbow, rElbow) > shoulderWidthSq * (flareRatio * flareRatio);
    const lElbowBent = lElbowAngle >= 45 && lElbowAngle <= 145;
    const rElbowBent = rElbowAngle >= 45 && rElbowAngle <= 145;

    if (lWristNearHip && rWristNearHip && elbowsFlaredWide && lElbowBent && rElbowBent) {
      return { pose: 'Lat Spread', confidence: 0.88 };
    }
  }

  // 4) Any Flex
  const maxFlexAngle = 125 + angleTolerance * 0.5;
  const wristShoulderMargin = shoulderWidth * 0.25;

  const leftArmFlex =
    lShoulderVis &&
    lElbowVis &&
    lWristVis &&
    lWrist.y < lShoulder.y + wristShoulderMargin &&
    lElbowAngle >= 35 &&
    lElbowAngle <= maxFlexAngle;

  const rightArmFlex =
    rShoulderVis &&
    rElbowVis &&
    rWristVis &&
    rWrist.y < rShoulder.y + wristShoulderMargin &&
    rElbowAngle >= 35 &&
    rElbowAngle <= maxFlexAngle;

  if (leftArmFlex || rightArmFlex) {
    return { pose: 'Any Flex', confidence: 0.85 };
  }

  return NO_POSE_RESULT;
}

/**
 * PoseDebouncer manages robust 250ms debouncing logic with dropped frame tolerance
 */
export class PoseDebouncer {
  private currentPose: PoseType | null = null;
  private candidatePose: PoseType | null = null;
  private candidateStartTime: number = 0;
  private missedFrames: number = 0;
  private maxMissedFrames: number = 6;
  private releaseStartTime: number = 0;
  private debounceMs: number;
  private releaseToleranceMs: number;

  constructor(debounceMs: number = 250, releaseToleranceMs: number = 400) {
    this.debounceMs = debounceMs;
    this.releaseToleranceMs = releaseToleranceMs;
  }

  public update(rawPose: PoseType | null, now: number = performance.now()): PoseDetectionResult {
    if (rawPose) {
      this.releaseStartTime = 0;
      this.missedFrames = 0;

      if (rawPose === this.currentPose) {
        this.candidatePose = null;
        return {
          detectedPose: this.currentPose,
          confidence: 1.0,
          rawPose,
        };
      }

      if (rawPose === this.candidatePose) {
        if (now - this.candidateStartTime >= this.debounceMs) {
          this.currentPose = rawPose;
          this.candidatePose = null;
        }
      } else {
        this.candidatePose = rawPose;
        this.candidateStartTime = now;
      }
    } else {
      this.missedFrames++;

      if (this.missedFrames > this.maxMissedFrames) {
        this.candidatePose = null;
      }

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
      rawPose,
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
