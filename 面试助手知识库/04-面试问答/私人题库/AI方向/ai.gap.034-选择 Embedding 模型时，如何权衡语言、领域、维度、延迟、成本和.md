---
id: "ai.gap.034"
category: "LLM应用基础"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["Embedding", "模型选型", "向量维度", "跨语言", "Recall@k", "双索引", "迁移兼容"]
project_ids: []
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 选择 Embedding 模型时，如何权衡语言、领域、维度、延迟、成本和后续迁移兼容性？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 如果由我设计，不会只看公开榜单，而会先用目标语言、文档类型和查询分布建立小型标注集。候选模型要比较 recall@k、Rerank 后效果、跨语言能力、向量维度、吞吐、尾延迟、价格和可部署性。高维通常表达能力更强，但会增加存储、内存和 ANN 搜索成本；领域模型可能在专业术语上更好，却牺牲通用和跨语言表现。还要检查最大输入长度、归一化方式、相似度定义和许可证。为迁移兼容，索引记录 embeddingModel 与版本，新旧向量不能直接混搜；通过后台重嵌入、双索引和灰度切换完成迁移，并保留回滚窗口。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.gap.034`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `research/ai-agent-interview-sources-20260828/question-answer-50-oral.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
