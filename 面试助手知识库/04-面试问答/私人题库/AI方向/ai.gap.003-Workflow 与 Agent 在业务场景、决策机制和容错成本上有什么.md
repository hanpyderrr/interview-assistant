---
id: "ai.gap.003"
category: "Agent架构与边界"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["Workflow", "Agent", "确定性", "自治决策", "容错", "混合架构"]
project_ids: []
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# Workflow 与 Agent 在业务场景、决策机制和容错成本上有什么本质区别？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 本质区别是决策权放在哪里。Workflow 的路径、条件和补偿通常由工程代码预先定义，适合规则稳定、合规要求高、结果可验证的流程；Agent 则让模型依据观察动态选择下一步，适合开放目标、步骤难预枚举的任务。前者可预测、易测试、成本可控，但适应变化较弱；后者灵活，却会放大非确定性、循环、越权和成本失控风险。实践中常采用混合模式：主干用 Workflow 保证边界，在检索改写、工具选择等局部节点开放 Agent 决策。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.gap.003`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `research/ai-agent-interview-sources-20260828/question-answer-50-oral.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
