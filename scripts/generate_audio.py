#!/usr/bin/env python3
"""
Generate placeholder listening audio (robotic TTS via espeak-ng) and clean
standalone transcript files for every Hörverstehen part in data/*.json.

This gives the site working audio out of the box. The voice is a basic
offline TTS engine, not natural-sounding — swap in real recordings or a
better TTS voiceover later by replacing the files in /audio/<level>/
(keep the same filenames) or updating the "audio" path in the JSON.

Usage: python3 scripts/generate_audio.py
Requires: espeak-ng, ffmpeg (both available via apt).
"""
import json
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")
AUDIO_DIR = os.path.join(ROOT, "audio")
TRANSCRIPT_DIR = os.path.join(ROOT, "transcripts")

LEVELS = ["a2", "b1", "b2"]
VOICE = "de"
SPEED = 150  # words per minute, roughly natural pace


def synth_wav(text, out_wav):
    subprocess.run(
        ["espeak-ng", "-v", VOICE, "-s", str(SPEED), "-w", out_wav, text],
        check=True,
    )


def wav_to_mp3(in_wav, out_mp3):
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", in_wav,
         "-codec:a", "libmp3lame", "-qscale:a", "4", out_mp3],
        check=True,
    )


def generate_for_part(level, part, audio_rel_path):
    transcript = part.get("transcript", "")
    if not transcript:
        return
    out_mp3 = os.path.join(ROOT, audio_rel_path)
    os.makedirs(os.path.dirname(out_mp3), exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        wav_path = os.path.join(tmp, "out.wav")
        synth_wav(transcript, wav_path)
        wav_to_mp3(wav_path, out_mp3)
    print(f"  wrote {audio_rel_path}")


def write_transcript_file(level, part):
    path = os.path.join(TRANSCRIPT_DIR, f"{level}-{part['id']}.txt")
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"{part['title']}\n")
        f.write("=" * len(part["title"]) + "\n\n")
        f.write(part.get("transcript", "").strip() + "\n")
    print(f"  wrote {os.path.relpath(path, ROOT)}")


def main():
    for level in LEVELS:
        data_path = os.path.join(DATA_DIR, f"{level}.json")
        with open(data_path, encoding="utf-8") as f:
            data = json.load(f)
        print(f"== {level.upper()} ==")
        for section in data["sections"]:
            if section["id"] != "hoeren":
                continue
            for part in section["parts"]:
                write_transcript_file(level, part)
                if "--with-audio" in sys.argv:
                    generate_for_part(level, part, part["audio"])
    print("Done.")


if __name__ == "__main__":
    main()
