---
id: "ai.gap.031"
category: "LLM应用基础"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["Tokenizer", "Token预算", "上下文窗口", "截断策略", "首Token延迟", "成本"]
project_ids: []
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 为什么不同模型对同一段中英文文本的 Token 数不同，这会怎样影响上下文预算、截断、延迟和成本？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 模型使用的 tokenizer、词表和归一化规则不同，同一字符串会被切成不同子词。英文常见词可能一个 Token，生僻词会拆分；中文有的接近一字一 Token，有的能合并词组，标点、代码和 Unicode 也会影响计数。因此不能按字符或另一个模型的 Token 估算，应使用目标模型 tokenizer。Token 增多会挤占上下文、触发截断，并增加预填充延迟和费用；切换模型时要重算提示词、检索块和输出预算，明确裁剪优先级。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.gap.031`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `research/ai-agent-interview-sources-20260828/question-answer-50-oral.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
