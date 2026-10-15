---
id: "ai.gap.038"
category: "Agentic RAG"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["混合检索", "Reranking", "证据引用", "一致性校验", "NDCG", "Groundedness", "分层评测"]
project_ids: []
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 如何把初筛、Reranking、证据引用和回答一致性校验串成可评测的 RAG 流水线？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 如果由我设计，先把每一阶段的输入输出都版本化并保留文档 ID、块 ID 和分数。初筛用向量、关键词或混合检索扩大候选集并做权限过滤；Reranker 结合原问题对候选重新排序，选择有限证据块并去重。生成 Prompt 中给每块稳定引用 ID，要求答案的事实性陈述绑定引用。生成后校验引用是否存在、是否真的支持对应 claim，并检查数值、实体和否定关系；不一致时有限重写或返回证据不足。评测分层进行：初筛看 recall@k，排序看 MRR/NDCG，引用看精确率和覆盖率，最终看忠实度、正确性、延迟和成本，这样才能定位退化来自哪一段。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.gap.038`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `research/ai-agent-interview-sources-20260828/question-answer-50-oral.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
