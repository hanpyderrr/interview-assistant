"""Convert interview questions to Windows SAPI5 WAV files."""

from __future__ import annotations

import argparse
import sys
import wave
from pathlib import Path


def list_voices() -> None:
    try:
        import pyttsx3
    except ImportError as exc:
        raise RuntimeError('pyttsx3 is not installed; run python -m pip install pyttsx3') from exc
    engine = pyttsx3.init('sapi5')
    for voice in engine.getProperty('voices'):
        print(f'{voice.id}\t{voice.name}')
    engine.stop()


def synthesize(text: str, output: Path, voice: str | None = None, rate: int = 175) -> Path:
    if not text.strip():
        raise ValueError('text must not be empty')
    if not 50 <= rate <= 400:
        raise ValueError('rate must be between 50 and 400 words per minute')
    try:
        import pyttsx3
    except ImportError as exc:
        raise RuntimeError('pyttsx3 is not installed; run python -m pip install pyttsx3') from exc
    output.parent.mkdir(parents=True, exist_ok=True)
    engine = pyttsx3.init('sapi5')
    try:
        if voice:
            engine.setProperty('voice', voice)
        engine.setProperty('rate', rate)
        engine.save_to_file(text.strip(), str(output))
        engine.runAndWait()
    finally:
        engine.stop()
    if not output.exists() or output.stat().st_size == 0:
        raise RuntimeError(f'SAPI5 did not create an audio file: {output}')
    try:
        with wave.open(str(output), 'rb') as wav:
            if wav.getnchannels() < 1 or wav.getsampwidth() < 1 or wav.getframerate() <= 0:
                raise ValueError('invalid WAV parameters')
    except (wave.Error, OSError, ValueError) as exc:
        raise RuntimeError(f'SAPI5 created an invalid WAV file: {output}') from exc
    return output


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Convert text to a WAV file with Windows SAPI5')
    parser.add_argument('--text')
    parser.add_argument('--text-file', type=Path)
    parser.add_argument('--output', type=Path, default=Path('recordings/question.wav'))
    parser.add_argument('--voice')
    parser.add_argument('--rate', type=int, default=175)
    parser.add_argument('--list-voices', action='store_true')
    args = parser.parse_args(argv)
    if not args.list_voices and bool(args.text) == bool(args.text_file):
        parser.error('provide exactly one of --text or --text-file unless --list-voices is used')
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    if args.list_voices:
        list_voices()
        return 0
    text = args.text_file.read_text(encoding='utf-8') if args.text_file else args.text
    print(f'Created {synthesize(text, args.output, args.voice, args.rate)}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
