---
id: "ai.gap.032"
category: "LLM应用基础"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["Self-Attention", "位置表示", "QKV", "Multi-Head", "长上下文", "KV Cache"]
project_ids: []
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# Self-Attention 为什么需要位置表示，Q/K/V 和 Multi-Head 各解决什么问题，长上下文成本为何随之增长？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> Self-Attention 对输入顺序不敏感，所以需要位置表示，让模型区分先后与距离。Q 表示当前位置想找什么，K 表示各位置可怎样匹配，二者相似度形成注意力权重，再对 V 承载的内容加权汇总。Multi-Head 让模型在不同投影空间同时关注语法、指代和远距离关系。标准全注意力比较任意两位置，长度为 n 时计算和显存大致按 n² 增长；生成阶段 KV cache 也随长度增长，因此长上下文会增加预填充延迟、显存和成本。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.gap.032`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `research/ai-agent-interview-sources-20260828/question-answer-50-oral.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
