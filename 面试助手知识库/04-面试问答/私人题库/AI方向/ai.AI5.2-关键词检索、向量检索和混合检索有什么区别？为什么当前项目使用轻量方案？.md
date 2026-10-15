---
id: "ai.AI5.2"
category: "RAG"
fact_status: "prepared_answer"
review_status: "confirmed"
evidence_status: "verified"
keywords: ["关键词检索", "向量检索", "混合检索", "BM25", "embedding", "Recall@k", "MRR"]
project_ids: ["plankiller"]
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "e08c013"
---
# 关键词检索、向量检索和混合检索有什么区别？PlanKiller 当前如何实现？

> [!note] 当前证据
> 已核对 PlanKiller 当前代码。项目已实现轻量混合检索；没有引入独立向量数据库，向量随 chunk 存储在 SQLite 文本字段中。

先尝试口述，再展开源库答案。

> [!note]- 当前口述答案
> 关键词检索看词面命中，部署简单、可解释，适合专有名词和精确字段，但同义表达召回较弱；向量检索用 Embedding 表示语义，能补同义表达，却增加模型依赖、存储和评测成本；混合检索把两类信号合并。PlanKiller 当前采用轻量混合方案：关键词分数来自标题和正文命中，语义分数来自查询向量与 chunk 向量的余弦相似度，两者加权后排序。由于是单用户、小数据量应用，向量直接保存在 SQLite，不需要独立向量库。Embedding 异常时自然退化到关键词评分。当前能证明功能实现，尚不能用 Recall@k、MRR 或延迟提升说明效果，后续需要固定真实问题集比较关键词基线、向量检索和混合检索。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.AI5.2`
- 核对版本：提交 `e08c013` 之后的当前工作树。
- 代码证据：`apps/api/app/memory.py`、`apps/api/app/models.py`。

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
