from array import array
import math
import shutil
import subprocess
import wave

SAMPLE_RATE = 44100
CHANNELS = 2
SAMPLE_WIDTH = 2  # 16-bit
TWO_PI = 2.0 * math.pi
INV_SAMPLE_RATE = 1.0 / SAMPLE_RATE


def midi_to_freq(m: int) -> float:
    return 440.0 * (2.0 ** ((m - 69.0) / 12.0))


chords = [
    # Chord 1: Db maj / Bbm7
    [53, 56, 60, 61, 65, 68, 72, 73, 77, 80, 84, 85, 89, 92, 96, 92, 89, 85, 84, 80, 77, 73, 72, 68],
    # Chord 2: C minor / Eb
    [51, 55, 58, 60, 63, 67, 70, 72, 75, 79, 82, 84, 87, 91, 94, 91, 87, 84, 82, 79, 75, 72, 70, 67],
    # Chord 3: Bbm
    [49, 53, 56, 58, 61, 65, 68, 70, 73, 77, 80, 82, 85, 89, 92, 89, 85, 82, 80, 77, 73, 70, 68, 65],
    # Chord 4: C maj / dominant
    [48, 52, 55, 58, 60, 64, 67, 70, 72, 76, 79, 82, 84, 88, 91, 88, 84, 82, 79, 76, 72, 70, 67, 64],
]

bass_notes = [41, 39, 37, 36]  # F2, Eb2, Db2, C2

note_duration = 0.095
chord_duration = len(chords[0]) * note_duration
total_duration = chord_duration * 4 + 2.5

num_samples = int(total_duration * SAMPLE_RATE)
left_channel = array("d", [0.0]) * num_samples
right_channel = array("d", [0.0]) * num_samples

sin = math.sin
exp = math.exp
half_pi = math.pi * 0.5

# Render bass & angelic pad
for c_idx, bass in enumerate(bass_notes):
    start_t = c_idx * chord_duration
    start_s = int(start_t * SAMPLE_RATE)
    end_s = min(int((start_t + chord_duration + 1.5) * SAMPLE_RATE), num_samples)
    w = TWO_PI * midi_to_freq(bass)
    w_detune = w * 2.003
    w3 = w * 3.0
    w_half = w * 0.5
    for s in range(start_s, end_s):
        t = (s - start_s) * INV_SAMPLE_RATE
        env = sin(min(1.0, t * 2.5) * half_pi) * exp(-t * 0.35)
        val = (
            0.35 * sin(w * t)
            + 0.20 * sin(w_detune * t)
            + 0.12 * sin(w3 * t)
            + 0.08 * sin(w_half * t)
        )
        sample_val = val * env * 0.2
        left_channel[s] += sample_val
        right_channel[s] += sample_val

# Render harp arpeggio
for c_idx, chord in enumerate(chords):
    c_start_t = c_idx * chord_duration
    chord_len = len(chord)
    for n_idx, midi_val in enumerate(chord):
        start_s = int((c_start_t + n_idx * note_duration) * SAMPLE_RATE)
        w = TWO_PI * midi_to_freq(midi_val)
        decay = 1.8 if midi_val < 75 else 1.2
        inv_decay = 3.5 / decay
        pan = 0.3 + 0.4 * (n_idx / chord_len)
        left_gain = 0.32 * (1.0 - pan)
        right_gain = 0.32 * pan

        end_s = min(start_s + int(decay * SAMPLE_RATE), num_samples)
        w5 = w * 5.01
        for s in range(start_s, end_s):
            t = (s - start_s) * INV_SAMPLE_RATE
            attack = 1.0 if t >= 0.005 else t * 200.0
            env = attack * exp(-t * inv_decay)
            phase = w * t
            harp = (
                sin(phase)
                + 0.5 * sin(phase * 2.0) * exp(-t * 5.0)
                + 0.25 * sin(phase * 3.0) * exp(-t * 8.0)
                + 0.15 * sin(phase * 4.0) * exp(-t * 12.0)
                + 0.08 * sin(w5 * t) * exp(-t * 15.0)
            )
            sig = harp * env
            left_channel[s] += sig * left_gain
            right_channel[s] += sig * right_gain

# Apply celestial stereo delay / reverb tail
delay_samples_l = int(SAMPLE_RATE * 0.28)
delay_samples_r = int(SAMPLE_RATE * 0.35)
feedback = 0.38

for s in range(delay_samples_l, num_samples):
    left_channel[s] += left_channel[s - delay_samples_l] * feedback
for s in range(delay_samples_r, num_samples):
    right_channel[s] += right_channel[s - delay_samples_r] * feedback

# Normalize & pack interleaved stereo int16 via C-backed array
max_val = max(
    max(abs(x) for x in left_channel),
    max(abs(x) for x in right_channel),
    0.0001,
)
scale = (0.92 * 32767.0) / max_val

pcm = array("h", [0]) * (num_samples * 2)
for s in range(num_samples):
    ls = int(left_channel[s] * scale)
    rs = int(right_channel[s] * scale)
    pcm[2 * s] = -32767 if ls < -32767 else (32767 if ls > 32767 else ls)
    pcm[2 * s + 1] = -32767 if rs < -32767 else (32767 if rs > 32767 else rs)

wav_path = "public/audio/great_fairy_fountain.wav"
mp3_path = "public/audio/great_fairy_fountain.mp3"

with wave.open(wav_path, "wb") as wav_file:
    wav_file.setnchannels(CHANNELS)
    wav_file.setsampwidth(SAMPLE_WIDTH)
    wav_file.setframerate(SAMPLE_RATE)
    wav_file.writeframes(pcm.tobytes())

if shutil.which("ffmpeg"):
    import os
    subprocess.run(
        ["ffmpeg", "-y", "-i", wav_path, "-codec:a", "libmp3lame", "-qscale:a", "2", mp3_path],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    os.remove(wav_path)
    print(f"Generated {mp3_path} successfully!")
else:
    print(f"Generated {wav_path} successfully!")
