// Web Audio API Majestic Audio Synchronizer

export class MajesticAudioManager {
  private ctx: AudioContext | null = null;
  private audioBuffer: AudioBuffer | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private gainNode: GainNode | null = null;
  private streamDestination: MediaStreamAudioDestinationNode | null = null;

  private isLoaded: boolean = false;
  private isPoseActive: boolean = false;
  public masterVolume: number = 0.85;
  public isMuted: boolean = false;

  public isAudioReady(): boolean {
    return this.isLoaded;
  }

  constructor() {}

  /**
   * Initialize AudioContext upon user gesture (Start Camera)
   */
  public async init(): Promise<void> {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        try {
          await this.ctx.resume();
        } catch {
          // ignore
        }
      }
      return;
    }

    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AudioContextClass();

    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        // ignore
      }
    }

    // iOS WebKit AudioContext Unlock: play a tiny 1-sample silent buffer during user gesture
    try {
      const unlockBuffer = this.ctx.createBuffer(1, 1, 22050);
      const unlockSource = this.ctx.createBufferSource();
      unlockSource.buffer = unlockBuffer;
      unlockSource.connect(this.ctx.destination);
      unlockSource.start(0);
    } catch {
      // ignore
    }

    // Attach touch listeners to keep AudioContext active if iOS Safari suspends it in background
    const autoResume = () => {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    };
    window.addEventListener('touchstart', autoResume, { passive: true, once: false });
    window.addEventListener('click', autoResume, { passive: true, once: false });

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

    // Continuous silent carrier oscillator to keep Web Audio continuously clocking active PCM frames.
    // This prevents iOS WebKit AAC encoder from dropping frames or writing invalid moov sample tables when idle.
    try {
      const silentOsc = this.ctx.createOscillator();
      silentOsc.frequency.setValueAtTime(20, this.ctx.currentTime);
      const silentGain = this.ctx.createGain();
      // Use sub-audible amplitude (0.00001) so WebKit does not optimize away the node as a pure zero signal
      silentGain.gain.setValueAtTime(0.00001, this.ctx.currentTime);
      silentOsc.connect(silentGain);
      silentGain.connect(this.streamDestination);
      silentOsc.start();
    } catch {
      // ignore
    }

    await this.loadAudioTrack();
  }

  public resumeIfSuspended(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private async loadAudioTrack(): Promise<void> {
    try {
      const response = await fetch('/audio/great_fairy_fountain.wav');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      if (this.ctx) {
        // Handle both Promise and callback versions of decodeAudioData for WebKit compatibility
        this.audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
          this.ctx!.decodeAudioData(arrayBuffer, resolve, reject);
        });
        this.isLoaded = true;
        console.log('Majestic track loaded successfully');
      }
    } catch (err) {
      console.warn('Could not load local audio file, synthesizing procedural angelic harp track...', err);
      this.synthesizeAngelicHarpBuffer();
    }
  }

  /**
   * High-fidelity procedural angelic harp buffer fallback
   */
  private synthesizeAngelicHarpBuffer(): void {
    if (!this.ctx) return;
    const sampleRate = this.ctx.sampleRate;
    const duration = 12.0;
    const buffer = this.ctx.createBuffer(2, sampleRate * duration, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    const midiNotes = [53, 56, 60, 61, 65, 68, 72, 73, 77, 80, 84, 85, 89, 92, 96];
    const noteStep = 0.09;

    for (let i = 0; i < midiNotes.length * 3; i++) {
      const noteIdx = i % midiNotes.length;
      const freq = 440 * Math.pow(2, (midiNotes[noteIdx] - 69) / 12);
      const startSample = Math.floor(i * noteStep * sampleRate);
      const noteDurSamples = Math.floor(1.8 * sampleRate);
      const endSample = Math.min(startSample + noteDurSamples, left.length);
      const pan = 0.2 + 0.6 * (noteIdx / midiNotes.length);

      for (let s = startSample; s < endSample; s++) {
        const t = (s - startSample) / sampleRate;
        const env = Math.exp(-t * 3.8);
        const wave = Math.sin(2 * Math.PI * freq * t) + 
                     0.4 * Math.sin(4 * Math.PI * freq * t) * Math.exp(-t * 6.0) +
                     0.2 * Math.sin(6 * Math.PI * freq * t) * Math.exp(-t * 10.0);
        const val = wave * env * 0.2;
        left[s] += val * (1 - pan);
        right[s] += val * pan;
      }
    }

    this.audioBuffer = buffer;
    this.isLoaded = true;
  }

  /**
   * Triggered when majestic pose is recognized
   */
  public triggerPoseAudio(): void {
    if (!this.ctx || !this.audioBuffer || !this.filterNode || !this.gainNode) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    this.isPoseActive = true;
    const now = this.ctx.currentTime;

    // Stop previous buffer source if looping
    if (this.currentSource) {
      try {
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch {
        // ignore
      }
    }

    const source = this.ctx.createBufferSource();
    source.buffer = this.audioBuffer;
    source.loop = true;
    source.connect(this.filterNode);
    source.start(now);
    this.currentSource = source;

    // Filter sweep from 500Hz to 18,000Hz (crystal clarity)
    this.filterNode.frequency.cancelScheduledValues(now);
    this.filterNode.frequency.setValueAtTime(500, now);
    this.filterNode.frequency.exponentialRampToValueAtTime(18000, now + 0.35);

    // Volume swell to master volume
    const targetGain = this.isMuted ? 0.0001 : Math.max(0.0001, this.masterVolume);
    this.gainNode.gain.cancelScheduledValues(now);
    this.gainNode.gain.setValueAtTime(0.001, now);
    this.gainNode.gain.exponentialRampToValueAtTime(targetGain, now + 0.28);
  }

  /**
   * Release when pose is no longer detected
   */
  public releasePoseAudio(): void {
    if (!this.ctx || !this.filterNode || !this.gainNode) return;
    this.isPoseActive = false;
    const now = this.ctx.currentTime;

    // Muffle filter back down
    this.filterNode.frequency.cancelScheduledValues(now);
    this.filterNode.frequency.exponentialRampToValueAtTime(450, now + 0.5);

    // Fade volume down
    this.gainNode.gain.cancelScheduledValues(now);
    this.gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

    setTimeout(() => {
      if (!this.isPoseActive && this.currentSource) {
        try {
          this.currentSource.stop();
          this.currentSource.disconnect();
          this.currentSource = null;
        } catch {
          // ignore
        }
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
      const target = (this.isMuted || !this.isPoseActive) ? 0.0001 : Math.max(0.0001, this.masterVolume);
      this.gainNode.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
    }
  }

  public getAudioStreamDestination(): MediaStreamAudioDestinationNode | null {
    return this.streamDestination;
  }

  /**
   * Play clean synthesized audio cues for gesture recognition, countdown, and record start/stop
   */
  public playCueChime(type: 'gesture_detected' | 'countdown_beep' | 'record_start' | 'record_stop'): void {
    if (!this.ctx || this.isMuted) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      if (type === 'gesture_detected') {
        // High ascending double-ping (confirmation of peace sign)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1320, now + 0.12);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'countdown_beep') {
        // Crisp metronome beep
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(780, now);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'record_start') {
        // Triumphant ascending chime
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.45);
      } else if (type === 'record_stop') {
        // Descending double chime
        osc.type = 'sine';
        osc.frequency.setValueAtTime(783.99, now);
        osc.frequency.setValueAtTime(523.25, now + 0.1);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      }
    } catch {
      // ignore
    }
  }
}
