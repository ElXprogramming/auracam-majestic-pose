import { NormalizedLandmark, LM } from './poseClassifier';

export interface SkeletonOptions {
  isMirrored: boolean;
  isPoseActive: boolean;
  glowColor?: string;
  jointColor?: string;
}

// Connections between BlazePose joints
export const POSE_CONNECTIONS: [number, number][] = [
  // Face
  [LM.NOSE, LM.LEFT_EYE],
  [LM.NOSE, LM.RIGHT_EYE],
  [LM.LEFT_EYE, LM.LEFT_EAR],
  [LM.RIGHT_EYE, LM.RIGHT_EAR],
  
  // Torso
  [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
  [LM.LEFT_SHOULDER, LM.LEFT_HIP],
  [LM.RIGHT_SHOULDER, LM.RIGHT_HIP],
  [LM.LEFT_HIP, LM.RIGHT_HIP],

  // Left Arm
  [LM.LEFT_SHOULDER, LM.LEFT_ELBOW],
  [LM.LEFT_ELBOW, LM.LEFT_WRIST],
  [LM.LEFT_WRIST, LM.LEFT_INDEX],

  // Right Arm
  [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW],
  [LM.RIGHT_ELBOW, LM.RIGHT_WRIST],
  [LM.RIGHT_WRIST, LM.RIGHT_INDEX],

  // Left Leg
  [LM.LEFT_HIP, LM.LEFT_KNEE],
  [LM.LEFT_KNEE, LM.LEFT_ANKLE],

  // Right Leg
  [LM.RIGHT_HIP, LM.RIGHT_KNEE],
  [LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
];

export function renderNeonSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  width: number,
  height: number,
  options: SkeletonOptions
) {
  if (!landmarks || landmarks.length === 0) return;

  const { isMirrored, isPoseActive } = options;

  ctx.save();
  ctx.clearRect(0, 0, width, height);

  const primaryColor = isPoseActive ? '#ffd700' : '#38bdf8'; // Gold if majestic, cyan if searching
  const glowColor = isPoseActive ? 'rgba(255, 215, 0, 0.8)' : 'rgba(56, 189, 248, 0.6)';
  const haloColor = isPoseActive ? 'rgba(255, 230, 100, 0.35)' : 'rgba(56, 189, 248, 0.2)';

  // Helper to map normalized coordinates to canvas pixels
  const getPoint = (lm: NormalizedLandmark) => {
    let x = lm.x;
    if (isMirrored) {
      x = 1.0 - x;
    }
    return {
      x: x * width,
      y: lm.y * height,
      visibility: lm.visibility ?? 1.0,
    };
  };

  // Draw Connections
  ctx.lineWidth = isPoseActive ? 3.5 : 2.5;
  ctx.strokeStyle = primaryColor;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = isPoseActive ? 16 : 8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const [startIdx, endIdx] of POSE_CONNECTIONS) {
    const lmStart = landmarks[startIdx];
    const lmEnd = landmarks[endIdx];

    if (!lmStart || !lmEnd) continue;
    if ((lmStart.visibility ?? 1) < 0.4 || (lmEnd.visibility ?? 1) < 0.4) continue;

    const p1 = getPoint(lmStart);
    const p2 = getPoint(lmEnd);

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }

  // Draw Glowing Joint Nodes
  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i];
    if (!lm || (lm.visibility ?? 1) < 0.45) continue;
    // Highlight key joints (wrists, elbows, shoulders, hips)
    const isKeyJoint = [
      LM.LEFT_WRIST, LM.RIGHT_WRIST,
      LM.LEFT_ELBOW, LM.RIGHT_ELBOW,
      LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER
    ].includes(i);

    const pt = getPoint(lm);

    // Outer halo
    if (isKeyJoint && isPoseActive) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = haloColor;
      ctx.fill();
    }

    // Inner node
    ctx.beginPath();
    const radius = isKeyJoint ? (isPoseActive ? 5 : 4) : 3;
    ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = isKeyJoint ? '#ffffff' : primaryColor;
    ctx.shadowBlur = 10;
    ctx.fill();
  }

  ctx.restore();
}
