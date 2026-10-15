---
id: "ai.AI5.1"
category: "RAG"
fact_status: "prepared_answer"
review_status: "confirmed"
evidence_status: "verified"
keywords: ["RAG", "长期记忆", "关键词检索", "向量检索", "混合检索", "Embedding降级", "top-k", "source_type"]
project_ids: ["plankiller"]
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "e08c013"
---
# PlanKiller 的长期记忆/RAG 数据从哪里来，如何建立索引和召回？

> [!note] 当前证据
> 已核对 `/Users/hanzhongyi/WORKSPACE/PlanKiller` 当前代码。混合检索实现已提交；现有自动测试覆盖索引、关键词召回和记忆命中，但尚未看到独立的向量排序质量评测，不能虚构 Recall@k 或延迟提升。

先尝试口述，再展开源库答案。

> [!note]- 当前口述答案
> 长期记忆来源包括计划、复盘、习惯日志、AI 洞察和手工记忆。数据先转换为 `MemoryDocument`，再切成最长约 1000 字符的 `MemoryChunk`；每个来源用 `source_type + source_id` 关联，便于增量新增、替换、删除和全量重建。建立或更新索引时，系统在配置可用的情况下请求 OpenAI-compatible Embedding，并把向量序列化到 SQLite 的 `embedding_json`。查询时同时计算关键词分数和余弦相似度，当前融合方式是 `keyword_score + semantic_score × 100`，再按分数、日期和 ID 排序返回 top-k 片段与来源元数据。Embedding 未配置、请求失败、返回数量异常或向量不可用时，向量为空，评分函数自动只使用关键词分数，因此记忆检索和普通业务仍可运行。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.AI5.1`
- 核对版本：提交 `e08c013` 之后的当前工作树；`memory.py` 本次核对时无未提交改动。
- 代码证据：`apps/api/app/memory.py`、`apps/api/app/models.py`、`apps/api/tests/test_api.py`。

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
