# 云端回答生成

回答适配器兼容 OpenAI Chat Completions 格式，默认使用 `https://api.openai.com/v1` 和 `gpt-4o-mini`，也可以配置其他兼容服务。

先准备请求文件（上一阶段已经生成）：

```powershell
$env:INTERVIEW_LLM_API_KEY = "你的密钥"
$env:INTERVIEW_LLM_BASE_URL = "https://api.openai.com/v1"
$env:INTERVIEW_LLM_MODEL = "gpt-4o-mini"
npm run answer:interview -- realtime_audio\transcripts\question-01-answer-request.json
```

程序不会把密钥写入输出文件或日志。没有配置密钥时会明确报错；测试使用 mock，不需要真实密钥。
