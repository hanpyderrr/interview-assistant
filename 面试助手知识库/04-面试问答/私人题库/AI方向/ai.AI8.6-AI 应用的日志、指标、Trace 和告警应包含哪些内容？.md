---
id: "ai.AI8.6"
category: "可观测性"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["日志", "指标", "Trace", "告警", "request_id", "P99", "脱敏"]
project_ids: []
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# AI 应用的日志、指标、Trace 和告警应包含哪些内容？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 日志记录 request_id、用户/租户匿名 ID、provider/model/version、路由、耗时阶段、错误类别和降级原因，脱敏后不记录 Key/完整隐私 Prompt；指标包括 QPS、成功率、fallback、429/5xx、P50/P95/P99、token、成本、队列、检索命中和动作拒绝率；Trace 串联前端、API、检索、模型和工具。告警按错误率、延迟、成本异常和安全事件设置阈值，并链接到可操作的排障信息。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.AI8.6`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/11_AI应用系统工程师专项答案.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
