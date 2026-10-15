---
id: "ai.AI2.6"
category: "PlanKiller 架构"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["生产级差距", "多租户", "模型网关", "PostgreSQL", "灰度发布", "可观测性"]
project_ids: ["plankiller"]
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 这个项目目前离生产级 AI 平台还有哪些差距？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 当前项目是单用户、SQLite、轻量关键词与向量混合检索（Embedding 不可用时退回关键词）和 OpenAI-compatible 外部调用，已经有 API 测试和桌面烟测，但还缺多租户/认证、PostgreSQL 与缓存、可扩展队列、模型网关、向量/混合检索评测、完整指标与 Trace、密钥托管、灰度发布、弹性伸缩和故障演练。面试中主动说明差距反而更可信；我会先按业务量和风险补基础设施，而不是为了贴“大规模”标签直接拆成很多服务。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.AI2.6`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/11_AI应用系统工程师专项答案.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
