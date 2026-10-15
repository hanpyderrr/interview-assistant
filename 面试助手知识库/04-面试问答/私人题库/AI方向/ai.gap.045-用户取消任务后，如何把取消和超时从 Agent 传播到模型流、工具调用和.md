---
id: "ai.gap.045"
category: "Agent Runtime"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["取消传播", "Deadline", "Cancellation Token", "Fencing Token", "迟到结果", "竞态控制", "补偿"]
project_ids: []
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 用户取消任务后，如何把取消和超时从 Agent 传播到模型流、工具调用和子 Agent，并避免迟到结果污染状态？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 取消要成为任务状态和调用上下文中的一等信号。用户请求取消后，运行时用带 version 的原子更新把任务标为 cancelling，并触发 cancellation token；模型流关闭连接并调用供应商取消能力，工具客户端中止请求，子 Agent 收到父 deadline 与取消事件。无法强制停止的外部操作要标记结果未知，后续通过查询或补偿处理。每个异步写回都携带 taskVersion、attemptId 或 fencing token，只有当前仍有效且未取消的尝试才能提交；迟到结果只进审计，不改变状态。取消接口幂等，最终状态区分 cancelled、timed_out 和 completed_before_cancel，并清理队列、缓冲区与临时资源。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.gap.045`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `research/ai-agent-interview-sources-20260828/question-answer-50-oral.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
