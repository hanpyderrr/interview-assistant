---
id: "ai.gap.021"
category: "多Agent协作"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["单Agent", "多Agent", "任务边界", "并行执行", "协调成本", "评测"]
project_ids: []
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 什么情况下应该使用单 Agent，什么情况下值得拆成多 Agent？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 默认先用单 Agent，因为它共享上下文、调试链路短、延迟和成本可控。只有任务存在清晰的能力边界、子任务能独立验收、上下文过大需要隔离，或确实能安全并行时，才值得拆成多 Agent。拆分不能只是更换角色名，还要定义输入输出契约、所有权、合并规则和失败处理。多 Agent 会增加通信、重复执行、一致性和权限传播问题，因此应在同一任务集比较成功率、耗时、成本和可恢复性；收益不明显就保留单 Agent。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.gap.021`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `research/ai-agent-interview-sources-20260828/question-answer-50-oral.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
