---
id: "ai.gap.024"
category: "多Agent协作"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["A2A", "熔断", "舱壁隔离", "Deadline", "重试预算", "降级", "Fencing Token"]
project_ids: []
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# A2A 超时、子 Agent 宕机和工具调用雪崩时，如何熔断、降级和隔离？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 先把故障限制在租户、任务和依赖边界内。入口设置总 deadline 与预算，向每个子 Agent 和工具传递递减超时；各依赖使用独立连接池、并发舱壁和队列上限，防止一个慢工具占满全部 worker。连续超时或错误率升高时熔断，半开只放少量探测。子 Agent 宕机后由租约过期触发有限重试，使用同一逻辑任务 ID 和幂等键，迟到结果不能写回。降级顺序应预定义，例如使用缓存、较小模型、只读结果或返回部分证据，并标明完整性。排查时关联 A2A、模型与工具 trace，确认是排队、下游饱和还是重试放大；恢复时逐步放量，避免同时重试造成第二次雪崩。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.gap.024`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `research/ai-agent-interview-sources-20260828/question-answer-50-oral.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
