// Cached iOS and Device Detection Utilities for Mobile Safari and iPadOS

let cachedIsIOS: boolean | null = null;
let cachedIsIPad: boolean | null = null;
let cachedIsSafari: boolean | null = null;

export function isIOS(): boolean {
  if (cachedIsIOS !== null) return cachedIsIOS;
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  cachedIsIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return cachedIsIOS;
}

export function isIPad(): boolean {
  if (cachedIsIPad !== null) return cachedIsIPad;
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  cachedIsIPad =
    /iPad/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return cachedIsIPad;
}

export function isSafari(): boolean {
  if (cachedIsSafari !== null) return cachedIsSafari;
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  cachedIsSafari =
    (ua.includes('safari') && !ua.includes('chrome') && !ua.includes('chromium') && !ua.includes('android')) ||
    isIOS();
  return cachedIsSafari;
}
