---
id: "ai.gap.022"
category: "多Agent协作"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["子任务ID", "Attempt", "租约", "Inbox", "Outbox", "乐观锁", "结果去重"]
project_ids: []
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 多 Agent 如何下发子任务并避免重复下发、重复执行和结果重复合并？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 如果由我设计，协调器会为每个逻辑子任务分配稳定 taskId 和 attemptId，并把目标、输入版本、依赖、输出 schema 与验收条件写入任务表。下发通过带唯一键的队列，worker 领取时用租约或原子状态迁移，防止并发占用；重复消息允许到达，但执行前查询 inbox 和副作用账本。重试只增加 attemptId，不改变逻辑 taskId。结果提交采用 compare-and-set，只有当前有效尝试能把任务置为完成；聚合器按 taskId 去重，并记录已消费结果版本。超时的旧 worker 即使迟到也不能覆盖新结果，有副作用的动作还需端到端幂等键。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.gap.022`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `research/ai-agent-interview-sources-20260828/question-answer-50-oral.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
