---
id: "ai.gap.012"
category: "工具、MCP与Skills"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["MCP", "Skills", "能力连接", "行为编排", "工具发现", "安全边界"]
project_ids: []
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# MCP 和 Skills 有什么区别，它们在 Agent 系统中如何配合？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> MCP 解决“怎样标准化连接能力”，Skills 解决“Agent 应按什么方法使用能力”。MCP 服务暴露工具、资源或提示模板，定义发现、参数和调用协议；Skill 是可加载的操作指南，包含触发条件、步骤、约束和质量标准。两者配合时，Skill 规定任务流程与安全边界，再调用 MCP 工具获取数据或执行动作。MCP 负责接口互操作，Skill 负责领域流程复用；权限仍应由运行时和服务端校验，不能把 Skill 当作安全控制。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.gap.012`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `research/ai-agent-interview-sources-20260828/question-answer-50-oral.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
