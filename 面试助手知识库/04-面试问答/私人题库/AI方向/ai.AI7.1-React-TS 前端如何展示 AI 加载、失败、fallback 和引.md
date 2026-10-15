---
id: "ai.AI7.1"
category: "前端全栈"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["状态机", "fallback", "引用记忆", "request_id", "错误处理", "React"]
project_ids: ["plankiller"]
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# React/TS 前端如何展示 AI 加载、失败、fallback 和引用？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 用明确状态机区分 idle/loading/success/fallback/error，提交后禁用重复发送，失败时保留输入并给重试入口。响应展示 provider 状态、Agent 依据、建议动作和引用记忆，但把建议与已执行视觉区分。错误解析统一为可读消息，避免把 JSON 堆栈直接展示。请求组件需要取消过期请求，按 request_id 防止旧响应覆盖新消息。PlanKiller AI 页已展示 memory hits、agent trace 和 suggested actions，仍需继续做异常交互测试。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.AI7.1`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/11_AI应用系统工程师专项答案.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
