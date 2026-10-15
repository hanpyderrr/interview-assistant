---
id: "ai.gap.043"
category: "Agent Runtime"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["Agent Runtime", "状态机", "事件溯源", "Checkpoint", "审计", "崩溃恢复", "确定性回放"]
project_ids: []
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# Agent Runtime 如何用状态机和事件溯源支持审计、崩溃恢复与确定性回放？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 如果由我设计，状态机定义任务与节点的合法状态和迁移，事件日志则以追加方式记录每次命令、决策、工具调用、结果和人工操作。写入时对聚合版本做乐观锁，并在同一事务中追加事件和 outbox；当前状态由事件归约得到，定期 checkpoint 加速恢复。崩溃后读取最近 checkpoint，再重放其后的事件，检查未完成副作用账本后续跑。审计事件包含 actor、版本、输入摘要、原因和 traceId。确定性回放必须固定模型、Prompt、工具 schema、采样参数和依赖快照，外部工具默认使用录制结果或沙箱；如果调用实时依赖，只能算重执行，不能宣称完全确定回放。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.gap.043`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `research/ai-agent-interview-sources-20260828/question-answer-50-oral.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
