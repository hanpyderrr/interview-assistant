---
id: "ai.gap.039"
category: "Agentic RAG"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["Agentic RAG", "状态机", "权限过滤", "版本化缓存", "Fallback", "证据追踪", "分层评测"]
project_ids: []
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 设计一个生产级 Agentic RAG 系统时，状态、检索工具、权限、缓存、评测和 fallback 如何协作？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 如果由我设计，运行时以显式状态机协调各部分：状态保存原问题、租户权限、检索历史、证据、预算与版本；检索工具只接受结构化查询和服务端 ACL 过滤，返回带来源与版本的证据。缓存按租户、权限摘要、查询、索引和模型版本组成键，权限变化立即失效，不能共享未授权结果。每轮由证据充分性和预算决定继续检索、换源或生成。fallback 预先分级，例如向量检索失败时用关键词、Rerank 超时时按初筛排序、模型故障时切备用或只返回证据摘要，并明确质量降级。离线评测与线上 trace 使用同一版本标识，任何组件升级都做分层回归和灰度。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.gap.039`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `research/ai-agent-interview-sources-20260828/question-answer-50-oral.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
