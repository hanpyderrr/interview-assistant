---
id: "ai.gap.023"
category: "数据与持久化"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["数据建模", "状态机", "乐观锁", "幂等键", "Checkpoint", "Outbox", "数据保留"]
project_ids: []
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# AI 会话、消息、任务、工具调用和 Checkpoint 应如何建模，并处理事务、并发更新、乐观锁、幂等键和数据保留？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 如果由我设计，会把会话作为交互容器、消息作为不可变事件、任务作为可执行生命周期、工具调用作为独立副作用记录、Checkpoint 作为特定版本的状态快照。各表都带 tenantId、稳定 ID、createdAt 和版本；任务与工具调用有明确状态机。单库内用事务保证状态与 outbox 同步提交，跨系统依靠事件和最终一致性。并发更新通过 version 做 compare-and-set，失败后重新读取而非覆盖。工具调用使用 taskId、stepId 和参数哈希构成幂等键。保留策略按数据类型、合规和审计需求区分，删除时传播到消息正文、索引、缓存和对象存储，但必要审计仅留脱敏元数据。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.gap.023`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `research/ai-agent-interview-sources-20260828/question-answer-50-oral.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
