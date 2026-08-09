"""Command-line realtime interview session MVP.

Captures or replays WAV chunks, transcribes each chunk, and emits a prepared
answer request when speech is followed by enough silent chunks.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np

from audio_capture import CaptureConfig, float_to_pcm16, iter_capture_chunks


@dataclass
class SessionState:
    transcript_parts: list[str] | None = None
    silence_chunks: int = 0
    had_speech: bool = False

    def __post_init__(self):
        if self.transcript_parts is None:
            self.transcript_parts = []

    def observe(self, has_speech: bool) -> None:
        if has_speech:
            self.had_speech = True
            self.silence_chunks = 0
        else:
            self.silence_chunks += 1


def is_silent(samples: Iterable[float], threshold: float = 0.01) -> bool:
    data = np.asarray(list(samples), dtype=np.float32)
    return data.size == 0 or float(np.sqrt(np.mean(np.square(data)))) < threshold


def should_finalize(state: SessionState, silence_limit: int = 2) -> bool:
    return state.had_speech and state.silence_chunks >= silence_limit and bool(state.transcript_parts)


def run_utf8_subprocess(command: list[str], *, cwd: Path, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            command,
            cwd=cwd,
            env=env,
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='strict',
            check=False,
        )
    except UnicodeDecodeError as exc:
        raise RuntimeError('Node subprocess emitted non-UTF-8 output') from exc


def write_chunk_wav(samples: np.ndarray, output: Path, sample_rate: int = 16_000) -> Path:
    output.parent.mkdir(parents=True, exist_ok=True)
    pcm = float_to_pcm16(samples)
    with wave.open(str(output), 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm.tobytes())
    return output


def run_node_json(project_root: Path, script: str, args: list[str], env: dict[str, str]) -> dict:
    command = ['node', f'scripts/{script}', *args]
    result = run_utf8_subprocess(command, cwd=project_root, env=env)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or f'{script} failed')
    try:
        return json.loads(result.stdout.strip())
    except json.JSONDecodeError as exc:
        raise RuntimeError(f'{script} returned invalid JSON') from exc


def transcribe_chunk(project_root: Path, wav_path: Path, language: str, model: str, output_dir: Path) -> str:
    env = os.environ.copy()
    env.setdefault('NODE_USE_ENV_PROXY', '1')
    record = run_node_json(project_root, 'transcribe-audio.mjs', [str(wav_path), '--language', language, '--model', model, '--output-dir', str(output_dir)], env)
    return record.get('text', '').strip()


def prepare_answer_request(project_root: Path, question: str, output: Path) -> dict:
    result = run_utf8_subprocess(
        ['node', 'scripts/prepare-interview-request.mjs', question],
        cwd=project_root,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or 'prepare-interview-request.mjs failed')
    try:
        request = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError('prepare-interview-request.mjs returned invalid JSON') from exc
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(request, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return request


def process_chunks(chunks: Iterable[np.ndarray], project_root: Path, output_dir: Path, language: str, model: str, silence_limit: int, threshold: float) -> list[Path]:
    state = SessionState()
    finalized: list[Path] = []
    with tempfile.TemporaryDirectory(prefix='interview-session-') as temp_dir:
        temp_root = Path(temp_dir)
        for index, samples in enumerate(chunks, start=1):
            wav_path = write_chunk_wav(samples, temp_root / f'chunk-{index:04d}.wav')
            text = transcribe_chunk(project_root, wav_path, language, model, output_dir / 'chunk-transcripts')
            if text:
                state.transcript_parts.append(text)
            state.observe(not is_silent(samples, threshold))
            print(f'chunk={index} text={text!r}', flush=True)
            if should_finalize(state, silence_limit):
                question = ' '.join(state.transcript_parts).strip()
                request_path = output_dir / f'answer-request-{len(finalized) + 1:03d}.json'
                prepare_answer_request(project_root, question, request_path)
                finalized.append(request_path)
                print(f'question finalized: {question}', flush=True)
                state = SessionState()
    return finalized


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Realtime interview audio-to-answer MVP')
    parser.add_argument('--source', choices=['microphone', 'system'], default='microphone')
    parser.add_argument('--duration', type=float, default=30.0)
    parser.add_argument('--chunk-duration', type=float, default=1.0)
    parser.add_argument('--input-dir', type=Path, help='replay existing WAV chunks instead of opening an audio device')
    parser.add_argument('--language', default='zh')
    parser.add_argument('--model', default='Xenova/whisper-tiny')
    parser.add_argument('--silence-limit', type=int, default=2)
    parser.add_argument('--silence-threshold', type=float, default=0.01)
    parser.add_argument('--output-dir', type=Path, default=Path('realtime_audio/session-output'))
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    project_root = Path(__file__).resolve().parents[1]
    if args.input_dir:
        chunks = []
        for path in sorted(args.input_dir.glob('*.wav')):
            with wave.open(str(path), 'rb') as wav:
                chunks.append(np.frombuffer(wav.readframes(wav.getnframes()), dtype='<i2').astype(np.float32) / 32768.0)
    else:
        frames = max(1, round(args.chunk_duration * 16_000))
        chunks = iter_capture_chunks(CaptureConfig(args.source, Path('unused.wav'), args.duration, chunk_frames=frames))
    paths = process_chunks(chunks, project_root, args.output_dir, args.language, args.model, args.silence_limit, args.silence_threshold)
    print(f'Generated {len(paths)} answer request(s) in {args.output_dir}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
