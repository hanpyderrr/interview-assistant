# 音频转文字工具

当前版本支持标准 PCM WAV：16-bit、单声道或双声道。双声道会先混合为单声道，再重采样到 16 kHz，最后使用 Transformers 的 Whisper ASR pipeline 转写。

## 使用

```powershell
node scripts/transcribe-audio.mjs "D:\interview\question.wav" --language zh --output-dir "D:\interview\transcripts"
```

默认模型为 `Xenova/whisper-tiny`。首次使用会从 Hugging Face 下载模型；也可以指定已经准备好的模型目录或模型 ID：

```powershell
node scripts/transcribe-audio.mjs "D:\interview\question.wav" --model "Xenova/whisper-small" --language zh
```

输出两个文件：

- `<音频文件名>.txt`：纯文字转写。
- `<音频文件名>.json`：包含输入文件名、模型、语言、文本和音频时长，供后续题库检索使用。

## 当前限制

- 暂不直接处理 MP3、M4A 等压缩格式；需要先用音频工具转成 PCM WAV。
- 当前只完成离线文件转写入口，尚未接入实时麦克风或系统音频。
- 首次模型下载和中文准确率需要使用真实面试录音验证。
