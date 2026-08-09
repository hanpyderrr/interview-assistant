# 实时面试会话 MVP

## 真实采集

```powershell
python realtime_session.py --source microphone --duration 30 --chunk-duration 1
```

## 回放已有 WAV 块

```powershell
python realtime_session.py --input-dir recordings --output-dir session-output
```

程序会逐块转写，检测到“有语音 + 连续静音块”后生成 `answer-request-001.json`。当前版本只生成回答请求，不自动调用云端模型；配置 Key 后可单独运行 `npm run answer:interview -- <request.json>`。
