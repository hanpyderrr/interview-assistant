---
id: "edge.stt.qa.002"
category: "面试助手本地语音转文字"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "verified"
keywords: ["FunASR", "并发", "生命周期", "健康检查", "超时", "故障恢复", "本地服务"]
project_ids: ["interview_assistant"]
target_roles: ["embedded_linux", "ai_agent"]
熟练度: "未练习"
来源版本: "670911b"
---
# 本地 FunASR 如何处理并发、生命周期和故障？

先尝试口述，再展开答案。

> [!note]- 参考答案
> Electron 先访问固定回环地址的 `/health`。服务不存在时，管理器在 Windows 或 macOS 启动配套脚本，并轮询 `loading / ready / failed` 状态；并发调用 `ensureReady()` 共用同一个 Promise，避免重复启动。默认就绪等待上限 240 秒，单次健康请求 5 秒。模型服务只绑定 `127.0.0.1`，不会监听局域网地址。
>
> 音频请求只接受 16 kHz、mono、S16LE PCM，Python 服务限制请求体最大 20 MiB；Electron 侧另有十分钟单句上限和 120 秒请求超时。两个音频通道可能同时完成一句话，但 STT provider 各自按 Promise 队列串行发请求，服务端再用共享锁保护唯一模型实例。会话切换时使用 generation 和 request epoch，旧请求即使晚返回也不会写入新会话；静音 keepalive 不会被误当作新句开头。
>
> 目前的恢复边界是：能自动启动、等待模型、报告加载失败、拒绝格式错误并忽略过期结果。它没有证明服务崩溃后的自动拉起次数控制、正在执行的 HTTP 请求被主动取消、长时间压力下的吞吐和内存稳定性；这些应作为后续故障注入与持续运行测试。

## 可追问点
- 为什么 `ThreadingHTTPServer` 仍要给模型加锁？
- 双通道串行推理会怎样影响延迟，何时需要独立 Worker 或有界队列？
- 仅绑定回环地址解决了什么，仍有哪些本机进程访问风险？
- stop 后为什么要用 epoch 丢弃迟到结果？

## 证据
- `electron/audio/localFunAsrServiceManager.ts`
- `electron/audio/LocalFunAsrSTT.ts`
- `local-funasr/service.py`
- `electron/audio/__tests__/LocalFunAsrServiceManager.test.mjs`
- `electron/audio/__tests__/LocalFunAsrSTT.test.mjs`

[[01-项目经历/面试助手语音转文字-阅读入口|返回项目入口]] · [[05-面试复盘/复习记录|复习记录]]
