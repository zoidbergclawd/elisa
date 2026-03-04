#!/usr/bin/env python3
"""
Wake word recording tool for ESP32-S3-BOX-3.

Connects to the BOX-3 over USB serial, puts it in recording mode,
and captures labeled audio samples for wake word training.

Usage:
    python record.py                          # auto-detect port, guided session
    python record.py --port /dev/cu.usbmodem* # specify port
    python record.py --speaker dad            # label speaker
    python record.py --mode negative          # record negative samples only
    python record.py --laptop                 # use laptop mic instead of BOX-3

The script guides you through recording sessions:
  - Positive: "Say 'Hi Roo'" (the wake word)
  - Negative: similar-sounding phrases, background, silence
  - Each recording is 2 seconds of 16kHz mono PCM, saved as WAV
"""

import argparse
import glob
import os
import struct
import sys
import time
import wave

SAMPLE_RATE = 16000
CHANNELS = 1
SAMPLE_WIDTH = 2  # 16-bit
RECORD_DURATION = 2.0  # seconds per sample
SAMPLES_PER_RECORD = int(SAMPLE_RATE * RECORD_DURATION)

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')

# Prompts for guided recording sessions
POSITIVE_PROMPTS = [
    "Say 'Hi Roo' in your normal voice",
    "Say 'Hi Roo' a bit louder",
    "Say 'Hi Roo' quietly",
    "Say 'Hi Roo' from farther away (step back ~2m)",
    "Say 'Hi Roo' quickly",
    "Say 'Hi Roo' slowly",
    "Say 'Hi Roo' in a sing-song voice",
    "Say 'Hi Roo' like you just woke up",
]

NEGATIVE_PROMPTS = [
    "Say 'hero'",
    "Say 'hi room'",
    "Say 'Peru'",
    "Say 'hi boo'",
    "Say 'high roof'",
    "Say 'kangaroo'",
    "Say 'wahoo'",
    "Say 'hey Google'",
    "Say 'hey Siri'",
    "Say 'hello'",
    "Say 'hi there'",
    "Just stay quiet (silence)",
    "Talk normally about anything (background speech)",
    "Clap your hands a few times",
    "Cough or clear your throat",
]


def find_box3_port():
    """Auto-detect BOX-3 serial port."""
    patterns = [
        '/dev/cu.usbmodem*',
        '/dev/cu.usbserial*',
        '/dev/ttyUSB*',
        '/dev/ttyACM*',
    ]
    for pattern in patterns:
        matches = glob.glob(pattern)
        if matches:
            return matches[0]
    return None


def record_from_box3(port, duration=RECORD_DURATION):
    """Record audio from BOX-3 via serial RECORD command.

    Sends 'RECORD\\n' to put the device in recording mode.
    Device streams raw 16-bit LE PCM at 16kHz over serial.
    Sends 'STOP\\n' when done.

    Returns: bytes of raw PCM data
    """
    import serial

    ser = serial.Serial(port, 115200, timeout=1)
    time.sleep(0.1)  # let serial settle

    # Flush any pending data
    ser.reset_input_buffer()

    # Enter recording mode
    ser.write(b'RECORD\n')
    time.sleep(0.05)

    # Read PCM samples
    total_bytes = int(SAMPLE_RATE * duration * SAMPLE_WIDTH)
    audio_data = b''
    deadline = time.time() + duration + 2.0  # extra 2s timeout buffer

    while len(audio_data) < total_bytes and time.time() < deadline:
        chunk = ser.read(min(4096, total_bytes - len(audio_data)))
        if chunk:
            audio_data += chunk

    # Stop recording
    ser.write(b'STOP\n')
    ser.close()

    # Truncate to exact duration
    audio_data = audio_data[:total_bytes]

    return audio_data


def record_from_laptop(duration=RECORD_DURATION):
    """Record audio from laptop/desktop microphone using sounddevice.

    Returns: bytes of raw 16-bit LE PCM data
    """
    try:
        import sounddevice as sd
        import numpy as np
    except ImportError:
        print("ERROR: sounddevice not installed. Run: pip install sounddevice")
        sys.exit(1)

    print("  Recording...", end='', flush=True)
    audio = sd.rec(int(SAMPLE_RATE * duration), samplerate=SAMPLE_RATE,
                   channels=CHANNELS, dtype='int16')
    sd.wait()
    print(" done.")

    return audio.tobytes()


def save_wav(filepath, pcm_data):
    """Save raw PCM data as a WAV file."""
    with wave.open(filepath, 'wb') as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(SAMPLE_WIDTH)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm_data)


def get_next_index(directory, prefix):
    """Find the next available index for a filename like prefix_001.wav."""
    existing = glob.glob(os.path.join(directory, f'{prefix}_*.wav'))
    if not existing:
        return 1
    indices = []
    for f in existing:
        base = os.path.basename(f).replace('.wav', '')
        parts = base.split('_')
        try:
            indices.append(int(parts[-1]))
        except ValueError:
            pass
    return max(indices, default=0) + 1


def run_session(record_fn, speaker, mode):
    """Run an interactive recording session."""
    if mode in ('positive', 'both'):
        pos_dir = os.path.join(DATA_DIR, 'positive')
        os.makedirs(pos_dir, exist_ok=True)
        prefix = f'hiroo_{speaker}'
        idx = get_next_index(pos_dir, prefix)

        print(f"\n{'='*60}")
        print(f"  POSITIVE SAMPLES (wake word: 'Hi Roo')")
        print(f"  Speaker: {speaker}")
        print(f"  Starting at index: {idx}")
        print(f"{'='*60}\n")

        cycle = 0
        while True:
            prompt = POSITIVE_PROMPTS[cycle % len(POSITIVE_PROMPTS)]
            print(f"  [{idx:03d}] {prompt}")
            input("  Press ENTER to start recording (or 'q' to stop): ")

            if 'q' in input.__doc__:  # won't match, but the actual input is checked below
                pass

            try:
                pcm = record_fn()
            except KeyboardInterrupt:
                print("\n  Stopping positive session.")
                break

            filename = f'{prefix}_{idx:03d}.wav'
            filepath = os.path.join(pos_dir, filename)
            save_wav(filepath, pcm)
            print(f"  Saved: {filename} ({len(pcm)} bytes)")

            idx += 1
            cycle += 1

            resp = input("  Another? [Y/n/q]: ").strip().lower()
            if resp in ('n', 'q'):
                break

        print(f"\n  Positive samples recorded: {cycle}")

    if mode in ('negative', 'both'):
        neg_dir = os.path.join(DATA_DIR, 'negative')
        os.makedirs(neg_dir, exist_ok=True)
        prefix = f'neg_{speaker}'
        idx = get_next_index(neg_dir, prefix)

        print(f"\n{'='*60}")
        print(f"  NEGATIVE SAMPLES (things that should NOT trigger)")
        print(f"  Speaker: {speaker}")
        print(f"  Starting at index: {idx}")
        print(f"{'='*60}\n")

        cycle = 0
        while True:
            prompt = NEGATIVE_PROMPTS[cycle % len(NEGATIVE_PROMPTS)]
            print(f"  [{idx:03d}] {prompt}")
            input("  Press ENTER to start recording (or Ctrl+C to stop): ")

            try:
                pcm = record_fn()
            except KeyboardInterrupt:
                print("\n  Stopping negative session.")
                break

            filename = f'{prefix}_{idx:03d}.wav'
            filepath = os.path.join(neg_dir, filename)
            save_wav(filepath, pcm)
            print(f"  Saved: {filename} ({len(pcm)} bytes)")

            idx += 1
            cycle += 1

            resp = input("  Another? [Y/n/q]: ").strip().lower()
            if resp in ('n', 'q'):
                break

        print(f"\n  Negative samples recorded: {cycle}")


def main():
    parser = argparse.ArgumentParser(description='Record wake word samples from BOX-3')
    parser.add_argument('--port', help='Serial port (auto-detect if omitted)')
    parser.add_argument('--speaker', default='speaker1', help='Speaker label (e.g. dad, kid1)')
    parser.add_argument('--mode', choices=['positive', 'negative', 'both'], default='both',
                        help='Which samples to record')
    parser.add_argument('--laptop', action='store_true',
                        help='Use laptop microphone instead of BOX-3')
    parser.add_argument('--duration', type=float, default=RECORD_DURATION,
                        help=f'Recording duration in seconds (default: {RECORD_DURATION})')
    args = parser.parse_args()

    duration = args.duration

    if args.laptop:
        print("Using LAPTOP microphone")
        record_fn = lambda: record_from_laptop(duration)
    else:
        port = args.port or find_box3_port()
        if not port:
            print("ERROR: No BOX-3 found. Connect via USB-C or use --port or --laptop")
            sys.exit(1)
        print(f"Using BOX-3 on {port}")
        record_fn = lambda: record_from_box3(port, duration)

    print(f"Sample rate: {SAMPLE_RATE} Hz, Duration: {RECORD_DURATION}s")
    print(f"Data directory: {DATA_DIR}")

    # Count existing samples
    pos_count = len(glob.glob(os.path.join(DATA_DIR, 'positive', '*.wav')))
    neg_count = len(glob.glob(os.path.join(DATA_DIR, 'negative', '*.wav')))
    print(f"Existing samples: {pos_count} positive, {neg_count} negative\n")

    run_session(record_fn, args.speaker, args.mode)

    # Final tally
    pos_count = len(glob.glob(os.path.join(DATA_DIR, 'positive', '*.wav')))
    neg_count = len(glob.glob(os.path.join(DATA_DIR, 'negative', '*.wav')))
    print(f"\n{'='*60}")
    print(f"  Total: {pos_count} positive, {neg_count} negative samples")
    print(f"  Next step: python augment.py")
    print(f"{'='*60}")


if __name__ == '__main__':
    main()
