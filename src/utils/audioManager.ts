// Web Audio API Majestic Audio Synchronizer

const AUDIO_CANDIDATE_URLS = [
  '/audio/great_fairy_fountain.mp3',
  '/audio/great_fairy_fountain.wav',
];

export class MajesticAudioManager {
  private ctx: AudioContext | null = null;
  private audioBuffer: AudioBuffer | null = null;
  private rawAudioDataPromise: Promise<ArrayBuffer | null> | null = null;
  private decodePromise: Promise<void> | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private silentOsc: OscillatorNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private gainNode: GainNode | null = null;
  private streamDestination: MediaStreamAudioDestinationNode | null = null;
  private releaseTimeoutId: number | null = null;

  private isLoaded: boolean = false;
  private isPoseActive: boolean = false;
  public masterVolume: number = 0.85;
  public isMuted: boolean = false;

  private readonly handleAutoResume = () => {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  };

  public isAudioReady(): boolean {
    return this.isLoaded;
  }

  /**
   * Warm up network fetch in idle background without creating an AudioContext before user gesture
   */
  public preloadTrackBytes(): Promise<ArrayBuffer | null> {
    if (!this.rawAudioDataPromise) {
      this.rawAudioDataPromise = (async () => {
        for (const url of AUDIO_CANDIDATE_URLS) {
          try {
            const response = await fetch(url);
            if (response.ok) {
              return await response.arrayBuffer();
            }
          } catch {
            // try next candidate
          }
        }
        return null;
      })();
    }
    return this.rawAudioDataPromise;
  }

  /**
   * Unlock AudioContext immediately on user gesture without blocking camera startup on network I/O
   */
  public init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      if (!this.isLoaded && !this.decodePromise) {
        void this.ensureDecoded();
      }
      return;
    }

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    this.ctx = new AudioContextClass();

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    // iOS WebKit AudioContext Unlock: play a tiny 1-sample silent buffer synchronously in user gesture
    try {
      const unlockBuffer = this.ctx.createBuffer(1, 1, 22050);
      const unlockSource = this.ctx.createBufferSource();
      unlockSource.buffer = unlockBuffer;
      unlockSource.connect(this.ctx.destination);
      unlockSource.start(0);
    } catch {
      // ignore
    }

    window.addEventListener('touchstart', this.handleAutoResume, { passive: true });
    window.addEventListener('click', this.handleAutoResume, { passive: true });

    // Master filter: low-pass filter for muffled-to-brilliant angelic sweep
    this.filterNode = this.ctx.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.setValueAtTime(450, this.ctx.currentTime);
    this.filterNode.Q.setValueAtTime(2.5, this.ctx.currentTime);

    // Master gain: volume swell and fade
    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.setValueAtTime(0.0001, this.ctx.currentTime);

    // Create stream destination for MediaRecorder recording
    this.streamDestination = this.ctx.createMediaStreamDestination();

    // Route: Filter -> Gain -> Speakers & Recorder
    this.filterNode.connect(this.gainNode);
    this.gainNode.connect(this.ctx.destination);
    this.gainNode.connect(this.streamDestination);

    // Continuous silent carrier oscillator keeps Web Audio clocking active PCM frames for iOS WebKit AAC
    try {
      const silentOsc = this.ctx.createOscillator();
      const silentGain = this.ctx.createGain();
      silentGain.gain.setValueAtTime(0, this.ctx.currentTime);
      silentOsc.connect(silentGain);
      silentGain.connect(this.streamDestination);
      silentOsc.start();
      this.silentOsc = silentOsc;
    } catch {
      // ignore
    }

    // Decode audio asynchronously so getUserMedia never waits on audio download/decode
    void this.ensureDecoded();
  }

  public resumeIfSuspended(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private ensureDecoded(): Promise<void> {
    if (this.isLoaded) return Promise.resolve();
    if (this.decodePromise) return this.decodePromise;

    this.decodePromise = (async () => {
      try {
        const rawBytes = await this.preloadTrackBytes();
        if (rawBytes && this.ctx) {
          // Clone buffer slice in case decodeAudioData detaches the ArrayBuffer
          const copy = rawBytes.slice(0);
          this.audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
            this.ctx!.decodeAudioData(copy, resolve, reject);
          });
          this.isLoaded = true;
        } else {
          this.synthesizeAngelicHarpBuffer();
        }
      } catch (err) {
        console.warn('Audio decode fallback to procedural angelic harp track:', err);
        this.synthesizeAngelicHarpBuffer();
      } finally {
        this.decodePromise = null;
        // If user already struck a pose while decoding finished, start playing immediately
        if (this.isPoseActive && this.isLoaded && !this.currentSource) {
          this.triggerPoseAudio();
        }
      }
    })();

    return this.decodePromise;
  }

  /**
   * High-fidelity procedural angelic harp buffer fallback
   */
  private synthesizeAngelicHarpBuffer(): void {
    if (!this.ctx) return;
    const sampleRate = this.ctx.sampleRate;
    const duration = 12.0;
    const buffer = this.ctx.createBuffer(2, Math.floor(sampleRate * duration), sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    const midiNotes = [53, 56, 60, 61, 65, 68, 72, 73, 77, 80, 84, 85, 89, 92, 96];
    const noteStep = 0.09;
    const twoPi = 2 * Math.PI;
    const invSampleRate = 1 / sampleRate;

    for (let i = 0; i < midiNotes.length * 3; i++) {
      const noteIdx = i % midiNotes.length;
      const freq = 440 * Math.pow(2, (midiNotes[noteIdx] - 69) / 12);
      const w1 = twoPi * freq;
      const startSample = Math.floor(i * noteStep * sampleRate);
      const endSample = Math.min(startSample + Math.floor(1.8 * sampleRate), left.length);
      const pan = 0.2 + 0.6 * (noteIdx / midiNotes.length);
      const leftGain = 0.2 * (1 - pan);
      const rightGain = 0.2 * pan;

      for (let s = startSample; s < endSample; s++) {
        const t = (s - startSample) * invSampleRate;
        const env = Math.exp(-t * 3.8);
        const phase = w1 * t;
        const wave =
          Math.sin(phase) +
          0.4 * Math.sin(2 * phase) * Math.exp(-t * 6.0) +
          0.2 * Math.sin(3 * phase) * Math.exp(-t * 10.0);
        const val = wave * env;
        left[s] += val * leftGain;
        right[s] += val * rightGain;
      }
    }

    this.audioBuffer = buffer;
    this.isLoaded = true;
  }

  /**
   * Triggered when majestic pose is recognized
   */
  public triggerPoseAudio(): void {
    this.isPoseActive = true;

    if (this.releaseTimeoutId !== null) {
      window.clearTimeout(this.releaseTimeoutId);
      this.releaseTimeoutId = null;
    }

    if (!this.ctx || !this.filterNode || !this.gainNode) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    if (!this.audioBuffer) {
      void this.ensureDecoded();
      return;
    }

    const now = this.ctx.currentTime;

    // Only create a new source if not already looping from a brief dip
    if (!this.currentSource) {
      const source = this.ctx.createBufferSource();
      source.buffer = this.audioBuffer;
      source.loop = true;
      source.connect(this.filterNode);
      source.start(now);
      this.currentSource = source;
    }

    // Smooth filter sweep from current frequency to 18,000Hz (crystal clarity)
    const curFreq = Math.max(450, this.filterNode.frequency.value || 500);
    this.filterNode.frequency.cancelScheduledValues(now);
    this.filterNode.frequency.setValueAtTime(curFreq, now);
    this.filterNode.frequency.exponentialRampToValueAtTime(18000, now + 0.35);

    // Smooth volume swell from current gain to master volume (avoids pop on rapid re-trigger)
    const curGain = Math.max(0.0001, this.gainNode.gain.value || 0.001);
    const targetGain = this.isMuted ? 0.0001 : Math.max(0.0001, this.masterVolume);
    this.gainNode.gain.cancelScheduledValues(now);
    this.gainNode.gain.setValueAtTime(curGain, now);
    this.gainNode.gain.exponentialRampToValueAtTime(targetGain, now + 0.28);
  }

  /**
   * Release when pose is no longer detected
   */
  public releasePoseAudio(): void {
    this.isPoseActive = false;

    if (this.releaseTimeoutId !== null) {
      window.clearTimeout(this.releaseTimeoutId);
      this.releaseTimeoutId = null;
    }

    if (!this.ctx || !this.filterNode || !this.gainNode) return;
    const now = this.ctx.currentTime;

    const curFreq = Math.max(450, this.filterNode.frequency.value || 450);
    this.filterNode.frequency.cancelScheduledValues(now);
    this.filterNode.frequency.setValueAtTime(curFreq, now);
    this.filterNode.frequency.exponentialRampToValueAtTime(450, now + 0.5);

    const curGain = Math.max(0.0001, this.gainNode.gain.value || 0.0001);
    this.gainNode.gain.cancelScheduledValues(now);
    this.gainNode.gain.setValueAtTime(curGain, now);
    this.gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

    this.releaseTimeoutId = window.setTimeout(() => {
      this.releaseTimeoutId = null;
      if (!this.isPoseActive && this.currentSource) {
        try {
          this.currentSource.stop();
          this.currentSource.disconnect();
        } catch {
          // ignore
        }
        this.currentSource = null;
      }
    }, 600);
  }

  public setVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.gainNode && this.ctx && this.isPoseActive && !this.isMuted) {
      const target = Math.max(0.0001, this.masterVolume);
      this.gainNode.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
    }
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.gainNode && this.ctx) {
      const target = this.isMuted || !this.isPoseActive ? 0.0001 : Math.max(0.0001, this.masterVolume);
      this.gainNode.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
    }
  }

  public getAudioStreamDestination(): MediaStreamAudioDestinationNode | null {
    return this.streamDestination;
  }

  public destroy(): void {
    if (this.releaseTimeoutId !== null) {
      window.clearTimeout(this.releaseTimeoutId);
      this.releaseTimeoutId = null;
    }

    window.removeEventListener('touchstart', this.handleAutoResume);
    window.removeEventListener('click', this.handleAutoResume);

    if (this.currentSource) {
      try {
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch {
        // ignore
      }
      this.currentSource = null;
    }

    if (this.silentOsc) {
      try {
        this.silentOsc.stop();
        this.silentOsc.disconnect();
      } catch {
        // ignore
      }
      this.silentOsc = null;
    }

    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close().catch(() => {});
    }
    this.ctx = null;
  }
}
