import { NormalizedLandmark, LM } from './poseClassifier';

export interface SkeletonOptions {
  isMirrored: boolean;
  isPoseActive: boolean;
  glowColor?: string;
  jointColor?: string;
}

// Connections between BlazePose joints
export const POSE_CONNECTIONS: readonly (readonly [number, number])[] = [
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

const KEY_JOINTS = new Set<number>([
  LM.LEFT_WRIST,
  LM.RIGHT_WRIST,
  LM.LEFT_ELBOW,
  LM.RIGHT_ELBOW,
  LM.LEFT_SHOULDER,
  LM.RIGHT_SHOULDER,
]);

const TWO_PI = Math.PI * 2;

export function renderNeonSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  width: number,
  height: number,
  options: SkeletonOptions
) {
  ctx.clearRect(0, 0, width, height);
  if (!landmarks || landmarks.length === 0) return;

  const { isMirrored, isPoseActive } = options;

  const primaryColor = isPoseActive ? '#ffd700' : '#38bdf8';
  const glowColor = isPoseActive ? 'rgba(255, 215, 0, 0.34)' : 'rgba(56, 189, 248, 0.26)';
  const haloColor = isPoseActive ? 'rgba(255, 230, 100, 0.35)' : 'rgba(56, 189, 248, 0.2)';

  // Resolution-aware scale for crisp lines on high-density iPhone/iPad screens
  const scale = Math.max(1, Math.min(width, height) / 500);
  const coreWidth = (isPoseActive ? 4.0 : 2.8) * scale;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Batch all visible bone segments into a single path (dual-pass glow + core avoids costly per-segment shadowBlur)
  ctx.beginPath();
  for (let i = 0; i < POSE_CONNECTIONS.length; i++) {
    const conn = POSE_CONNECTIONS[i];
    const lmStart = landmarks[conn[0]];
    const lmEnd = landmarks[conn[1]];

    if (!lmStart || !lmEnd) continue;
    if ((lmStart.visibility ?? 1) < 0.4 || (lmEnd.visibility ?? 1) < 0.4) continue;

    const x1 = (isMirrored ? 1.0 - lmStart.x : lmStart.x) * width;
    const y1 = lmStart.y * height;
    const x2 = (isMirrored ? 1.0 - lmEnd.x : lmEnd.x) * width;
    const y2 = lmEnd.y * height;

    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }

  // Outer neon glow pass
  ctx.lineWidth = coreWidth * (isPoseActive ? 3.2 : 2.6);
  ctx.strokeStyle = glowColor;
  ctx.stroke();

  // Crisp inner core pass
  ctx.lineWidth = coreWidth;
  ctx.strokeStyle = primaryColor;
  ctx.stroke();

  // Batch outer halos for key joints
  const haloRadius = (isPoseActive ? 11 : 7.5) * scale;
  ctx.beginPath();
  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i];
    if (!lm || (lm.visibility ?? 1) < 0.45) continue;
    if (!KEY_JOINTS.has(i)) continue;

    const x = (isMirrored ? 1.0 - lm.x : lm.x) * width;
    const y = lm.y * height;
    ctx.moveTo(x + haloRadius, y);
    ctx.arc(x, y, haloRadius, 0, TWO_PI);
  }
  ctx.fillStyle = haloColor;
  ctx.fill();

  // Batch standard joints (primaryColor) and key joints (#ffffff) in two single fill calls
  const stdRadius = 3.5 * scale;
  ctx.beginPath();
  for (let i = 0; i < landmarks.length; i++) {
    if (KEY_JOINTS.has(i)) continue;
    const lm = landmarks[i];
    if (!lm || (lm.visibility ?? 1) < 0.45) continue;

    const x = (isMirrored ? 1.0 - lm.x : lm.x) * width;
    const y = lm.y * height;
    ctx.moveTo(x + stdRadius, y);
    ctx.arc(x, y, stdRadius, 0, TWO_PI);
  }
  ctx.fillStyle = primaryColor;
  ctx.fill();

  const keyRadius = (isPoseActive ? 5.5 : 4.5) * scale;
  ctx.beginPath();
  for (let i = 0; i < landmarks.length; i++) {
    if (!KEY_JOINTS.has(i)) continue;
    const lm = landmarks[i];
    if (!lm || (lm.visibility ?? 1) < 0.45) continue;

    const x = (isMirrored ? 1.0 - lm.x : lm.x) * width;
    const y = lm.y * height;
    ctx.moveTo(x + keyRadius, y);
    ctx.arc(x, y, keyRadius, 0, TWO_PI);
  }
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}
