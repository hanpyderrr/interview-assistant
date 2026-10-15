---
id: "ai.AI2.5"
category: "PlanKiller 架构"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["可审计链路", "错误处理", "Agent", "fallback", "测试覆盖"]
project_ids: ["plankiller"]
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# PlanKiller 中最能体现个人工程能力的技术难点是什么？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 我会选择“把 AI 功能做成不破坏核心业务的可审计链路”：不仅调用模型，还要整理业务上下文、检索长期记忆、识别意图和安全边界、返回建议动作，并处理没有 Key 或上游失败的情况；同时前端展示依据和引用，后端用测试覆盖 fallback、memory 和 Agent trace。这个难点体现的是边界设计、错误处理、数据流和交付，而不是简单地调用一个 SDK。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.AI2.5`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/11_AI应用系统工程师专项答案.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
