// Camera Device & Aspect Ratio Management Engine

export interface CameraDeviceInfo {
  deviceId: string;
  label: string;
  facing: 'user' | 'environment' | 'unknown';
  isWideAngle: boolean;
}

export type AspectRatioMode = 'wide-sensor' | 'portrait-9-16' | 'landscape-16-9';

export interface CameraConfig {
  deviceId?: string;
  facingMode: 'user' | 'environment';
  aspectRatioMode: AspectRatioMode;
}

export async function getAvailableCameras(): Promise<CameraDeviceInfo[]> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    return [];
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter((d) => d.kind === 'videoinput');

    return videoDevices.map((d, index) => {
      const label = d.label || `Camera ${index + 1}`;
      const lower = label.toLowerCase();
      const isWideAngle = 
        lower.includes('wide') || 
        lower.includes('ultra') || 
        lower.includes('0.5') || 
        lower.includes('front 2') ||
        lower.includes('back 2');

      let facing: 'user' | 'environment' | 'unknown' = 'unknown';
      if (lower.includes('front') || lower.includes('user') || lower.includes('facing front')) {
        facing = 'user';
      } else if (lower.includes('back') || lower.includes('rear') || lower.includes('environment')) {
        facing = 'environment';
      }

      return {
        deviceId: d.deviceId,
        label,
        facing,
        isWideAngle,
      };
    });
  } catch (err) {
    console.warn('Could not enumerate cameras:', err);
    return [];
  }
}

export function buildMediaConstraints(config: CameraConfig): MediaStreamConstraints {
  const { deviceId, facingMode, aspectRatioMode } = config;

  const videoConstraints: MediaTrackConstraints = {};

  if (deviceId) {
    videoConstraints.deviceId = { ideal: deviceId };
  } else {
    // On iOS Safari, ideal facingMode is much more forgiving than strict facingMode
    videoConstraints.facingMode = { ideal: facingMode };
  }

  // Detect if device/browser is in landscape (e.g. iPad in landscape or desktop)
  const isLandscape = typeof window !== 'undefined' && window.innerWidth > window.innerHeight;

  // Configure resolution based on aspect ratio mode without 'min' constraints!
  // 'min' constraints cause OverconstrainedError on iOS Safari when camera sensor orientation differs.
  if (aspectRatioMode === 'wide-sensor') {
    if (isLandscape) {
      videoConstraints.width = { ideal: 1920 };
      videoConstraints.height = { ideal: 1440 };
      videoConstraints.aspectRatio = { ideal: 4 / 3 };
    } else {
      videoConstraints.width = { ideal: 1440 };
      videoConstraints.height = { ideal: 1920 };
      videoConstraints.aspectRatio = { ideal: 3 / 4 };
    }
  } else if (aspectRatioMode === 'portrait-9-16') {
    if (isLandscape) {
      videoConstraints.width = { ideal: 1920 };
      videoConstraints.height = { ideal: 1080 };
      videoConstraints.aspectRatio = { ideal: 16 / 9 };
    } else {
      videoConstraints.width = { ideal: 1080 };
      videoConstraints.height = { ideal: 1920 };
      videoConstraints.aspectRatio = { ideal: 9 / 16 };
    }
  } else {
    // Landscape 16:9
    videoConstraints.width = { ideal: 1920 };
    videoConstraints.height = { ideal: 1080 };
    videoConstraints.aspectRatio = { ideal: 16 / 9 };
  }

  return {
    audio: false,
    video: videoConstraints,
  };
}

export async function applyTrackWideZoom(track: MediaStreamTrack): Promise<boolean> {
  try {
    const caps = (track as unknown as { getCapabilities?: () => { zoom?: { min: number } } }).getCapabilities?.();
    if (caps && caps.zoom && typeof caps.zoom.min === 'number') {
      await (track as unknown as { applyConstraints: (c: unknown) => Promise<void> }).applyConstraints({
        advanced: [{ zoom: caps.zoom.min }]
      });
      console.log('Applied hardware min zoom:', caps.zoom.min);
      return true;
    }
  } catch (err) {
    console.warn('Could not apply hardware zoom:', err);
  }
  return false;
}
