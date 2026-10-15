---
id: "ai.AI3.1"
category: "FastAPI"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["ASGI", "async/await", "事件循环", "线程池", "SQLite", "Session"]
project_ids: ["plankiller"]
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# FastAPI 的异步模型是什么？哪些代码可以用 async，哪些不能简单异步化？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> FastAPI 基于 ASGI，async def 处理函数可在等待网络 I/O 时把事件循环让给其他请求；异步 HTTP、异步数据库驱动和 asyncio 任务适合 async。CPU 密集的解析、模型前后处理或同步阻塞库不能因为加了 async 就变快，会阻塞事件循环，应放线程/进程池或独立 worker。同步函数也能由框架放到线程池，但要理解线程安全和连接池限制。PlanKiller 的模型 HTTP 和提醒 worker 适合异步，SQLite/同步 ORM 使用时要控制并发和 Session 生命周期。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.AI3.1`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/11_AI应用系统工程师专项答案.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
