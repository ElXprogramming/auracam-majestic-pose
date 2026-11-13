# AuraCam: Majestic Gym Pose Filter ✨💪

[![Live Demo](https://img.shields.io/badge/Live_Demo-gymposecamera.vercel.app-f59e0b?style=flat-square&logo=vercel&logoColor=white)](https://gymposecamera.vercel.app)
[![Latest Release](https://img.shields.io/github/v/release/ElXprogramming/auracam-majestic-pose?color=blue)](https://github.com/ElXprogramming/auracam-majestic-pose/releases)
[![CI](https://github.com/ElXprogramming/auracam-majestic-pose/actions/workflows/ci.yml/badge.svg)](https://github.com/ElXprogramming/auracam-majestic-pose/actions/workflows/ci.yml)
[![GitHub Stars](https://img.shields.io/github/stars/ElXprogramming/auracam-majestic-pose?style=social)](https://github.com/ElXprogramming/auracam-majestic-pose/stargazers)

🌐 **Live Web App**: [https://gymposecamera.vercel.app](https://gymposecamera.vercel.app)

A mobile-first, high-performance real-time camera web application engineered with **Vite + React + Tailwind CSS**, **MediaPipe WebAssembly**, and a custom **WebGL Post-Processing Shader Pipeline**.

Detects iconic bodybuilding and gym poses in real-time and transitions into an angelic, ethereal aesthetic filter synchronized with the viral track **"Great Fairy's Fountain (Magical Version)" by Faiyshaal**.

---

## ✨ Features

- 📸 **Camera & Video Pipeline**:
  - Full mobile viewport responsiveness (9:16 portrait on mobile, 16:9 on desktop).
  - Front / rear camera switching.
  - Horizontal flip (mirror mode) for natural selfie posing.
  - Zero-latency WebGL canvas rendering.

- ⚡ **AI Pose Recognition (MediaPipe WASM)**:
  - Powered by `@mediapipe/tasks-vision` running on WebAssembly with GPU acceleration.
  - Real-time geometric joint angle calculation & 250ms debouncing.
  - Supported Poses:
    1. **Front Double Bicep**: Both elbows at shoulder level, arms flexed 70°-110°, wrists above elbows.
    2. **Zyzz / Archer Pose**: One arm extended straight out, opposite arm flexed behind/near head.
    3. **Lat Spread**: Hands on hips, elbows flared wide to expand silhouette.
    4. **Any Flex**: Single or double arm flexed with wrist above shoulder.
  - Dynamic HUD status badge: `SEARCHING FOR POSE...` ➔ `MAJESTIC POSE DETECTED: [POSE]`.
  - Optional futuristic neon cyberpunk / ethereal golden skeleton wireframe overlay.

- 🌟 **Majestic Ethereal Visual Shader (WebGL)**:
  - **High-pass Luminance Threshold & Diffusion Bloom**: Multi-tap Gaussian diffusion creating a dreamy angelic halo around skin highlights.
  - **Warm Golden Halation**: Edge warmth on glowing skin and lit muscles.
  - **Exposure & Contrast Boost with Lifted Matte Blacks**: Cinematic filmic tone curve where deep blacks lift softly into charcoal gold.
  - **Subtle Chromatic Aberration & Soft Vignette**: Radial RGB shift and edge vignette.
  - **Slow-Motion Zoom-in Pulse**: Ethereal breathing zoom effect while the pose is held.
  - Smooth 0.3s lerp transition between natural camera feed and divine aura.

- 🎵 **Audio Synchronization (Web Audio API)**:
  - Viral angelic harp arpeggios (*Great Fairy's Fountain - Magical Version*).
  - Clean autoplay unlocking on first user interaction.
  - Instant volume swell and low-pass filter frequency sweep (500Hz muffled ➔ 18,000Hz crystalline brilliance) on pose detection.
  - Smooth fade-down when pose is released.

- 🎬 **Recording & Sharing**:
  - Built-in video recorder using `MediaRecorder` capturing the filtered canvas at 30/60fps mixed with the synchronized Web Audio API stream.
  - TikTok-ready 9:16 preview modal with instant playback.
  - 1-click Download and native mobile Web Share.

- 🎛️ **Full Controls**:
  - Bloom & glow intensity slider.
  - Audio volume & mute toggle.
  - Pose sensitivity adjustment (strict vs lenient).
  - Camera flip & mirror toggles.

---

## 🚀 Getting Started

```bash
# Clone the repository
git clone https://github.com/ElXprogramming/auracam-majestic-pose.git
cd auracam-majestic-pose

# Install dependencies
npm install

# Start development server
npm run dev

# Build production assets
npm run build
```

---

## 🤝 Contributing & Security

Contributions and bug reports are welcome! Please review [CONTRIBUTING.md](CONTRIBUTING.md), our [Code of Conduct](CODE_OF_CONDUCT.md), and [SECURITY.md](SECURITY.md).

---

## 🛡️ License

MIT License. Crafted for aesthetic greatness.
