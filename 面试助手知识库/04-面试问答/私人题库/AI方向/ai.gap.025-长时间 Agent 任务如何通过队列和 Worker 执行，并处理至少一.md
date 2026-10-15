---
id: "ai.gap.025"
category: "异步任务与消息"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["消息队列", "Worker", "至少一次投递", "Outbox", "Inbox", "死信队列", "最终一致性"]
project_ids: []
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 长时间 Agent 任务如何通过队列和 Worker 执行，并处理至少一次投递、重复消费、死信、Outbox 和最终一致性？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 如果由我设计，请求入口只负责校验并持久化任务，在同一数据库事务中写任务记录和 outbox；发布器再把消息送入队列，避免任务已创建但消息丢失。Worker 用 messageId 做 inbox 去重，通过租约领取任务，并在 checkpoint 后确认消息。由于队列通常至少一次投递，业务执行必须用逻辑 taskId、stepId 和幂等键保证重复消费无副作用。可重试错误退避后重新入队，超过次数或遇到永久错误进入死信队列，并保留原因、版本和重放条件。状态、事件和结果通过版本化更新达到最终一致，客户端读取明确的 processing、partial、failed 等状态，而不是假装瞬时一致。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.gap.025`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `research/ai-agent-interview-sources-20260828/question-answer-50-oral.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
