---
id: "ai.gap.002"
category: "Agent架构与边界"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["LangChain", "LangGraph", "Spring AI", "框架选型", "可替换性", "状态编排"]
project_ids: []
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 结合实际项目，说明使用或不使用 LangChain、LangGraph、Spring AI 等 Agent 框架的取舍。

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 框架选择取决于流程复杂度、团队栈和维护成本，而不是功能清单。简单的单轮调用或固定 RAG 流程，直接使用模型 SDK 往往更透明，也更容易定位延迟和错误；存在分支、循环、暂停恢复和人工审批时，LangGraph 一类图运行时能减少状态编排成本；Java 团队若重视 Spring 生态、依赖注入和治理一致性，可优先考虑 Spring AI。评估时会做一个真实链路的最小样例，比较可观测性、扩展点、版本稳定性和逃生通道，避免业务逻辑被框架对象绑死。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.gap.002`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `research/ai-agent-interview-sources-20260828/question-answer-50-oral.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
