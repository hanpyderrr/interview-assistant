---
id: "ai.gap.013"
category: "工具、MCP与Skills"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["业务状态码", "响应契约", "Schema校验", "部分成功", "结果未知", "契约测试"]
project_ids: []
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 工具返回 HTTP 200，但业务逻辑实际上失败了，Agent 应如何识别和处理？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> HTTP 200 只说明传输层请求被处理，不代表业务成功。首先应为工具定义统一响应契约，至少包含业务 success、code、data、error、retryable 和 requestId，并用 schema 校验；其次在适配器中把供应商特有字段、空结果、部分成功和异步受理状态映射为明确语义。运行时依据业务码决定终止、重试、补偿或人工处理，不能让模型凭自然语言猜。排查时要保留原始响应的脱敏摘要，核对工具适配器、状态写入和下一轮观察是否一致。若结果语义不确定，任务应进入 unknown 状态并查询确认，避免把重复调用变成双重副作用。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.gap.013`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `research/ai-agent-interview-sources-20260828/question-answer-50-oral.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
