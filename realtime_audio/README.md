# Windows 音频采集 MVP

## 安装依赖

```powershell
cd E:\workspace\01_projects\interview-assistant\realtime_audio
python -m pip install -r requirements-audio.txt
```

## 列出设备

```powershell
python audio_capture.py --list-devices
```

## 采集麦克风

```powershell
python audio_capture.py --source microphone --duration 10 --output recordings\mic.wav
```

## 采集系统回环声音

```powershell
python audio_capture.py --source system --duration 10 --output recordings\system.wav
```

持续分块采集（每个 WAV 默认 100ms，可按 `--chunk-duration` 规划后续实时转写）：

```powershell
python audio_capture.py --stream --source microphone --duration 10 --output recordings\stream.wav
```

当前 `--stream` 会把每个块立即写成 `stream-0001.wav`、`stream-0002.wav` 等文件；下一步可把写文件替换成转写队列。

输出格式为 16 kHz、单声道、16-bit PCM WAV，可直接交给项目中的 `transcribe-audio.mjs`。
# Windows 音频采集 MVP

## 转写测试的代理设置

如果当前网络通过 `HTTP_PROXY`/`HTTPS_PROXY` 访问 Hugging Face，Node.js 24 运行 Whisper 转写前设置：

```powershell
$env:NODE_USE_ENV_PROXY = '1'
```

中文优先使用多语种 Whisper 模型，并显式指定 `--language zh`。资源允许时可尝试 `Xenova/whisper-base` 或更大模型；默认的 `Xenova/whisper-tiny` 更适合快速链路测试，识别准确率有限。
