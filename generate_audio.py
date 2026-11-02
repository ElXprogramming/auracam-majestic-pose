import math
import struct
import wave

SAMPLE_RATE = 44100
CHANNELS = 2
SAMPLE_WIDTH = 2  # 16-bit

def midi_to_freq(m):
    return 440.0 * (2.0 ** ((m - 69.0) / 12.0))

# Notes for Great Fairy Fountain arpeggio
# F3=53, Ab3=56, C4=60, Db4=61, F4=65, Ab4=68, C5=72, Db5=73, F5=77, Ab5=80, C6=84, Db6=85, F6=89, Ab6=92, C7=96
chords = [
    # Chord 1: Db maj / Bbm7
    [53, 56, 60, 61, 65, 68, 72, 73, 77, 80, 84, 85, 89, 92, 96, 92, 89, 85, 84, 80, 77, 73, 72, 68],
    # Chord 2: C minor / Eb
    [51, 55, 58, 60, 63, 67, 70, 72, 75, 79, 82, 84, 87, 91, 94, 91, 87, 84, 82, 79, 75, 72, 70, 67],
    # Chord 3: Bbm
    [49, 53, 56, 58, 61, 65, 68, 70, 73, 77, 80, 82, 85, 89, 92, 89, 85, 82, 80, 77, 73, 70, 68, 65],
    # Chord 4: C maj / dominant
    [48, 52, 55, 58, 60, 64, 67, 70, 72, 76, 79, 82, 84, 88, 91, 88, 84, 82, 79, 76, 72, 70, 67, 64]
]

bass_notes = [41, 39, 37, 36] # F2, Eb2, Db2, C2

note_duration = 0.095 # fast harp arpeggio
chord_duration = len(chords[0]) * note_duration # ~2.28s
total_duration = chord_duration * 4 + 2.5 # ~11.6 seconds loop

num_samples = int(total_duration * SAMPLE_RATE)
left_channel = [0.0] * num_samples
right_channel = [0.0] * num_samples

# Render bass & angelic pad
for c_idx, bass in enumerate(bass_notes):
    start_t = c_idx * chord_duration
    start_s = int(start_t * SAMPLE_RATE)
    end_s = int((start_t + chord_duration + 1.5) * SAMPLE_RATE)
    end_s = min(end_s, num_samples)
    freq = midi_to_freq(bass)
    for s in range(start_s, end_s):
        t = (s - start_s) / SAMPLE_RATE
        dur = end_s - start_s
        # envelope
        env = math.sin(min(1.0, t / 0.4) * math.pi * 0.5) * math.exp(-t * 0.35)
        # warm pad sound: fundamental + octaves + detuned
        val = 0.35 * math.sin(2 * math.pi * freq * t)
        val += 0.20 * math.sin(2 * math.pi * (freq * 2.003) * t)
        val += 0.12 * math.sin(2 * math.pi * (freq * 3.00) * t)
        val += 0.08 * math.sin(2 * math.pi * (freq * 0.5) * t)
        sample_val = val * env * 0.4
        left_channel[s] += sample_val * 0.5
        right_channel[s] += sample_val * 0.5

# Render harp arpeggio
for c_idx, chord in enumerate(chords):
    c_start_t = c_idx * chord_duration
    for n_idx, midi_val in enumerate(chord):
        note_t = c_start_t + n_idx * note_duration
        start_s = int(note_t * SAMPLE_RATE)
        freq = midi_to_freq(midi_val)
        decay = 1.8 if midi_val < 75 else 1.2
        pan = 0.3 + 0.4 * (n_idx / len(chord)) # stereo pan spread
        
        note_len_s = int(decay * SAMPLE_RATE)
        end_s = min(start_s + note_len_s, num_samples)
        
        for s in range(start_s, end_s):
            t = (s - start_s) / SAMPLE_RATE
            # Attack and exponential decay
            attack = min(1.0, t / 0.005)
            env = attack * math.exp(-t * (3.5 / decay))
            
            # Harp timbre: pluck + shimmer harmonics
            harp = (math.sin(2 * math.pi * freq * t) +
                    0.5 * math.sin(2 * math.pi * freq * 2 * t) * math.exp(-t * 5.0) +
                    0.25 * math.sin(2 * math.pi * freq * 3 * t) * math.exp(-t * 8.0) +
                    0.15 * math.sin(2 * math.pi * freq * 4 * t) * math.exp(-t * 12.0) +
                    0.08 * math.sin(2 * math.pi * (freq * 5.01) * t) * math.exp(-t * 15.0))
            
            sig = harp * env * 0.32
            left_channel[s] += sig * (1.0 - pan)
            right_channel[s] += sig * pan

# Apply celestial stereo delay / reverb tail
delay_samples_l = int(SAMPLE_RATE * 0.28)
delay_samples_r = int(SAMPLE_RATE * 0.35)
feedback = 0.38

for s in range(num_samples):
    if s >= delay_samples_l:
        left_channel[s] += left_channel[s - delay_samples_l] * feedback
    if s >= delay_samples_r:
        right_channel[s] += right_channel[s - delay_samples_r] * feedback

# Normalize
max_val = max(max(abs(x) for x in left_channel), max(abs(x) for x in right_channel), 0.0001)
scale = 0.92 / max_val

with wave.open("public/audio/great_fairy_fountain.wav", "wb") as wav_file:
    wav_file.setnchannels(CHANNELS)
    wav_file.setsampwidth(SAMPLE_WIDTH)
    wav_file.setframerate(SAMPLE_RATE)
    
    frames = bytearray()
    for s in range(num_samples):
        l_samp = int(max(-32767, min(32767, left_channel[s] * scale * 32767)))
        r_samp = int(max(-32767, min(32767, right_channel[s] * scale * 32767)))
        frames.extend(struct.pack('<hh', l_samp, r_samp))
    wav_file.writeframes(frames)

print("Generated public/audio/great_fairy_fountain.wav successfully!")
