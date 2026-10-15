---
id: "ai.AI3.4"
category: "FastAPI"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["异步HTTP", "任务队列", "并发限制", "熔断", "连接池", "fallback"]
project_ids: ["plankiller"]
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 如何防止 AI 请求阻塞普通业务 API？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 把 AI 调用与普通 CRUD 分开处理，使用异步 HTTP 或任务队列，限制并发数和超时；不要在事件循环里执行长时间 CPU 工作。独立的模型客户端、连接池和熔断器可以避免上游耗尽所有资源；必要时拆成 AI worker 服务。普通计划/习惯 API 应有自己的数据库连接池和限流。当前 PlanKiller 规模小，主要通过异步调用、异常 fallback 和模块边界隔离；还没有生产级队列和多实例压测数据，不能夸大。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.AI3.4`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/11_AI应用系统工程师专项答案.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
