// iOS and Device Detection Utilities for Mobile Safari and iPadOS

export function isIOS(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function isIPad(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  return (
    /iPad/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function isSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  return (
    (ua.includes('safari') && !ua.includes('chrome') && !ua.includes('chromium') && !ua.includes('android')) ||
    isIOS()
  );
}
