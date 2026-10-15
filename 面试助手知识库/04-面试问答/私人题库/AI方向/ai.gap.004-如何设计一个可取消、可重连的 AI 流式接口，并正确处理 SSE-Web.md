---
id: "ai.gap.004"
category: "AI接口与交互"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["SSE", "WebSocket", "断点续传", "取消传播", "背压", "首Token延迟", "流式错误"]
project_ids: []
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 如何设计一个可取消、可重连的 AI 流式接口，并正确处理 SSE/WebSocket、首 Token 延迟、背压和流式错误？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 如果由我设计，会先把流式会话建模为有 ID、有序号、有状态的任务，而不是一条不可恢复的连接。单向文本输出优先 SSE，需要双向实时控制时再选 WebSocket。服务端把模型事件写入短期可重放缓冲区，客户端重连携带 taskId 和 lastEventId，从下一序号续传；取消则通过 cancellation token 传播到模型、工具和子任务。背压采用有界队列、批量合并和慢消费者超时，绝不无限缓存。首 Token 延迟拆分为排队、检索、模型建连和首包时间分别观测。流内错误用结构化 error 事件和最终状态表达，HTTP 已提交后不能再靠状态码；同时防止取消后的迟到事件继续写状态。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.gap.004`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `research/ai-agent-interview-sources-20260828/question-answer-50-oral.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
