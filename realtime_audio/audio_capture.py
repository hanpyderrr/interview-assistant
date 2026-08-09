"""Windows microphone/system-loopback capture MVP.

The hardware adapter is intentionally isolated behind soundcard. Signal
conversion functions stay dependency-light so they can be tested without an
audio device.
"""

from __future__ import annotations

import argparse
import sys
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Iterator, Sequence

import numpy as np


SAMPLE_RATE = 16_000
CHANNELS = 1
CHUNK_FRAMES = 1_600  # 100 ms


def mix_channels(samples: Sequence[Sequence[float]]) -> np.ndarray:
    """Mix N-channel frames to mono without changing frame count."""
    data = np.asarray(samples, dtype=np.float32)
    if data.size == 0:
        return np.zeros(0, dtype=np.float32)
    if data.ndim == 1:
        return data.astype(np.float32, copy=False)
    return data.mean(axis=1, dtype=np.float32)


def resample_linear(samples: Sequence[float], source_rate: int, target_rate: int) -> np.ndarray:
    """Resample mono samples with linear interpolation."""
    source = np.asarray(samples, dtype=np.float32)
    if source.size == 0 or source_rate == target_rate:
        return source.copy()
    if source_rate <= 0 or target_rate <= 0:
        raise ValueError('sample rates must be positive')
    output_size = max(1, round(source.size * target_rate / source_rate))
    positions = np.arange(output_size, dtype=np.float32) * source_rate / target_rate
    left = np.floor(positions).astype(np.int64)
    right = np.minimum(left + 1, source.size - 1)
    fraction = positions - left
    return source[left] * (1.0 - fraction) + source[right] * fraction


def float_to_pcm16(samples: Iterable[float]) -> np.ndarray:
    clipped = np.clip(np.asarray(list(samples), dtype=np.float32), -1.0, 1.0)
    scaled = np.where(clipped >= 1.0, 32767.0, clipped * 32768.0)
    return np.rint(scaled).astype(np.int16)


@dataclass(frozen=True)
class CaptureConfig:
    source: str
    output: Path
    duration: float
    sample_rate: int = SAMPLE_RATE
    chunk_frames: int = CHUNK_FRAMES


def _load_soundcard():
    try:
        import soundcard as sc
    except ImportError as exc:
        raise RuntimeError('soundcard is not installed; run python -m pip install -r requirements-audio.txt') from exc
    return sc


def _validate_config(config: CaptureConfig) -> None:
    if config.source not in {'microphone', 'system'}:
        raise ValueError("source must be 'microphone' or 'system'")
    if config.duration <= 0:
        raise ValueError('duration must be positive')
    if config.sample_rate <= 0:
        raise ValueError('sample_rate must be positive')
    if config.chunk_frames <= 0:
        raise ValueError('chunk_frames must be positive')


def _capture_device(sc, source: str):
    if source == 'microphone':
        return sc.default_microphone()
    speaker = sc.default_speaker()
    device = sc.get_microphone(speaker.name, include_loopback=True)
    if not getattr(device, 'isloopback', False):
        raise RuntimeError(f'no loopback microphone found for speaker: {speaker.name}')
    return device


def iter_capture_chunks(config: CaptureConfig) -> Iterator[np.ndarray]:
    """Yield mono float32 chunks as they arrive from the selected device."""
    _validate_config(config)
    sc = _load_soundcard()
    device = _capture_device(sc, config.source)
    total_frames = round(config.duration * config.sample_rate)
    recorder_kwargs = {
        'samplerate': config.sample_rate,
        # Capture native channels because SoundCard documents a Windows
        # single-channel issue; mix after each chunk.
        'channels': None,
        'blocksize': config.chunk_frames,
    }
    try:
        with device.recorder(**recorder_kwargs) as recorder:
            captured = 0
            while captured < total_frames:
                chunk = np.asarray(recorder.record(numframes=min(config.chunk_frames, total_frames - captured)), dtype=np.float32)
                if chunk.size == 0 or chunk.shape[0] == 0:
                    raise RuntimeError('audio device returned an empty chunk')
                mono = mix_channels(chunk)
                captured += mono.shape[0]
                yield mono
    except Exception as exc:
        raise RuntimeError(f'failed to capture {config.source} audio: {exc}') from exc


def list_devices() -> None:
    try:
        import soundcard as sc
    except ImportError as exc:
        raise RuntimeError('soundcard is not installed; run python -m pip install -r requirements-audio.txt') from exc
    print('Microphones:')
    for device in sc.all_microphones(include_loopback=False):
        print(f'  {device.name}')
    print('Loopback speakers:')
    for device in sc.all_microphones(include_loopback=True):
        if getattr(device, 'isloopback', False):
            print(f'  {device.name}')


def capture_to_wav(config: CaptureConfig) -> Path:
    """Capture microphone or Windows speaker loopback audio to PCM WAV."""
    _validate_config(config)
    frames: list[np.ndarray] = []
    frames.extend(iter_capture_chunks(config))

    total_frames = round(config.duration * config.sample_rate)
    pcm = float_to_pcm16(np.concatenate(frames)[:total_frames])
    config.output.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(config.output), 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(config.sample_rate)
        wav.writeframes(pcm.tobytes())
    return config.output


def stream_capture_to_wav(config: CaptureConfig) -> list[Path]:
    """Write each live chunk immediately as a numbered WAV file."""
    _validate_config(config)
    output_dir = config.output.parent
    output_dir.mkdir(parents=True, exist_ok=True)
    stem = config.output.stem
    paths = []
    index = 1
    for chunk in iter_capture_chunks(config):
        while (output_dir / f'{stem}-{index:04d}.wav').exists():
            index += 1
        output = output_dir / f'{stem}-{index:04d}.wav'
        temporary = output.with_suffix('.tmp.wav')
        try:
            pcm = float_to_pcm16(chunk)
            with wave.open(str(temporary), 'wb') as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(config.sample_rate)
                wav.writeframes(pcm.tobytes())
            temporary.replace(output)
        except Exception as exc:
            temporary.unlink(missing_ok=True)
            raise RuntimeError(f'failed to write audio chunk {output}: {exc}') from exc
        paths.append(output)
        print(f'Captured chunk {index}: {output}', flush=True)
        index += 1
    return paths


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Capture Windows microphone or system loopback audio to PCM WAV')
    parser.add_argument('--source', choices=['microphone', 'system'], help='audio source')
    parser.add_argument('--duration', type=float, default=10.0, help='capture duration in seconds')
    parser.add_argument('--chunk-duration', type=float, default=CHUNK_FRAMES / SAMPLE_RATE, help='stream chunk duration in seconds')
    parser.add_argument('--output', type=Path, default=Path('recordings/capture.wav'))
    parser.add_argument('--list-devices', action='store_true')
    parser.add_argument('--stream', action='store_true', help='write numbered WAV chunks as they arrive')
    args = parser.parse_args(argv)
    if not args.list_devices and not args.source:
        parser.error('--source is required unless --list-devices is used')
    if args.chunk_duration <= 0:
        parser.error('--chunk-duration must be positive')
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    if args.list_devices:
        list_devices()
        return 0
    chunk_frames = max(1, round(args.chunk_duration * SAMPLE_RATE))
    config = CaptureConfig(args.source, args.output, args.duration, chunk_frames=chunk_frames)
    if args.stream:
        paths = stream_capture_to_wav(config)
        print(f'Captured {len(paths)} chunks to {args.output.parent}')
    else:
        output = capture_to_wav(config)
        print(f'Captured {args.source} audio to {output}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
