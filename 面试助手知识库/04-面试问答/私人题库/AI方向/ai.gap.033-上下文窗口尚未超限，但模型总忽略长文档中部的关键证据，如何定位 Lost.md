---
id: "ai.gap.033"
category: "LLM应用基础"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["Lost in the Middle", "证据位置", "Reranking", "Prompt布局", "引用准确率", "分层汇总"]
project_ids: []
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 上下文窗口尚未超限，但模型总忽略长文档中部的关键证据，如何定位 Lost in the Middle 并从检索、排序和 Prompt 布局上缓解？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 先确认不是检索失败。用带标注证据的问题记录证据是否进入 top-k、进入后的排名和在最终 Prompt 中的位置，再把同一证据分别放在开头、中间、结尾做对照；若内容相同而中间位置命中率明显下降，才说明存在位置偏差。缓解上先减少无关上下文，用小块召回加 Rerank 把关键证据提前；对多条证据按问题相关性组织，在开头给任务与约束，在结尾重复回答检查要求，并让模型先抽取证据再作答。跨文档问题可分批检索和分层汇总，避免一次塞满窗口。最终用证据覆盖率、引用准确率和位置切片评测验证，而不是只扩大窗口。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.gap.033`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `research/ai-agent-interview-sources-20260828/question-answer-50-oral.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
