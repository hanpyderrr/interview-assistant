---
id: "ai.AI3.5"
category: "FastAPI"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["SQLite", "PostgreSQL", "数据库迁移", "事务隔离", "双写校验", "备份回滚"]
project_ids: ["plankiller"]
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# SQLite 适合 PlanKiller 当前场景吗？如果并发增长如何迁移？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 单用户、桌面/个人 NAS、写入量有限时 SQLite 简单、可移植且便于备份，适合作为当前存储。并发用户、写事务和跨实例部署增长后，SQLite 的单文件锁和横向扩展会成为限制。迁移步骤应包括抽象数据库 URL、检查 SQLite 特性、用 PostgreSQL 建表和迁移、双写/回放校验、切换读写、备份回滚；缓存和队列另行设计。不能只换连接串，还要处理事务隔离、并发、索引和时间类型差异。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.AI3.5`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/11_AI应用系统工程师专项答案.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
