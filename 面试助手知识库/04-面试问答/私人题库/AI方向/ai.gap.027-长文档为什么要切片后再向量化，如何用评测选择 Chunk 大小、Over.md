---
id: "ai.gap.027"
category: "RAG工程"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["文档切片", "Chunk Size", "Overlap", "父子块", "证据完整率", "检索评测"]
project_ids: []
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 长文档为什么要切片后再向量化，如何用评测选择 Chunk 大小、Overlap 和父子块策略？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 长文档直接做一个向量会把多个主题压成平均语义，既超出模型长度，也难精确定位证据，所以要按语义和结构切片。Chunk 大小没有通用最优值，应先按标题、段落、表格等边界生成几组候选，再用真实问题及标注证据比较 recall@k、命中证据完整度、上下文冗余、延迟和成本。Overlap 用来保护跨边界语义，但过大会造成重复召回和索引膨胀。父子块策略通常用小块做精确召回，再返回包含完整上下文的父块；需要控制父块过大和多个子块重复带回同一内容。最终参数应按文档类型分层，而非全库统一。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.gap.027`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `research/ai-agent-interview-sources-20260828/question-answer-50-oral.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
