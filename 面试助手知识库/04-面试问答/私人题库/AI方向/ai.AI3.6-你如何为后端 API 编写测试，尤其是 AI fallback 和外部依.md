---
id: "ai.AI3.6"
category: "FastAPI"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["单元测试", "mock", "fallback", "测试数据库", "烟测", "幂等"]
project_ids: ["plankiller"]
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 你如何为后端 API 编写测试，尤其是 AI fallback 和外部依赖？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 用隔离的测试数据库和固定时区，覆盖正常 CRUD、校验错误、权限边界、模型成功、无 Key fallback、上游超时/非 2xx/脏响应、记忆召回、Agent trace 和建议动作。外部模型调用通过客户端抽象或 mock 注入，不在测试中使用真实 Key；断言响应结构、provider、reason 和数据持久化。对异步提醒、重试和幂等补时间可控的单元测试，再加少量真实兼容服务的手工烟测。PlanKiller 当前已有 21 项后端测试，但不等于覆盖全部生产场景。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.AI3.6`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/11_AI应用系统工程师专项答案.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
