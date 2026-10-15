---
id: "edge.stt.fact.001"
category: "面试助手本地语音转文字"
fact_status: "resume_fact"
review_status: "confirmed"
evidence_status: "verified"
keywords: ["FunASR", "Paraformer", "ONNX", "INT8", "PCM", "语音转文字", "本地推理"]
project_ids: ["interview_assistant"]
target_roles: ["embedded_linux", "ai_agent"]
熟练度: "未练习"
来源版本: "670911b"
---
# 面试助手本地 FunASR 语音转文字链路如何工作？

> [!note] 当前证据
> 已核对 `/Users/hanzhongyi/WORKSPACE/interview-assistant` 的提交 `735102a`、`670911b`、本地服务、Electron 接线和测试。该功能可作为嵌入式 AI / 边缘 AI 的实际项目证据。

先尝试口述，再展开答案。

> [!note]- 参考答案
> 音频侧分别接收面试官系统音频和用户麦克风的 PCM 数据，内部使用 16 kHz、单声道、16 位有符号小端格式。采集块先进入带单调时间戳的时间线，VAD 通知一句话结束后，`LocalFunAsrSTT` 合并本句 PCM，并串行调用本机 `http://127.0.0.1:8765/transcribe`。Python 服务校验采样率、通道数、位宽和请求大小，用 NumPy 把 `int16` 归一化为 `float32` 波形，再调用 FunASR ONNX 的 Paraformer 模型。服务返回文本和推理耗时，Electron 将结果转换为带说话人、segment ID、音频起止时间和会话 generation 的最终 transcript 事件，交给面试界面及后续回答链路。
>
> 这是一条“采集分段 + 句末批量识别”的本地链路，不是逐 token 的真正流式 ASR。双音频通道各有一个 STT provider，但共享同一个本地模型服务；服务端用锁串行保护模型推理。

## 我的口述与补充
在这里补充一次真实启动、转写和异常恢复过程，以及固定音频上的延迟与准确率数据。

## 证据
- `electron/audio/LocalFunAsrSTT.ts`
- `electron/audio/CaptureAudioTimeline.ts`
- `local-funasr/service.py`
- `electron/main.ts`

[[01-项目经历/面试助手语音转文字-阅读入口|返回项目入口]] · [[07-学习路线/嵌入式AI路线|嵌入式AI路线]]
