---
id: "ai.AI2.1"
category: "PlanKiller 架构"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["系统架构", "FastAPI", "React", "Tauri", "sidecar", "SQLite", "请求链路", "Agent"]
project_ids: ["plankiller"]
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 请画出 PlanKiller 的整体架构，并说明一次 AI 请求的完整链路。

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 前端 React/TypeScript 负责输入、状态和结果展示；FastAPI 后端负责请求/配置校验、安全边界、业务上下文、记忆检索、模型调用和持久化；SQLite 保存计划、习惯、复盘、提醒、洞察和记忆文档；AI 服务通过 OpenAI-compatible HTTP 接口接入；Tauri 将前端和 Python sidecar 打包为 Windows 客户端。当前 PlanKiller 是单用户应用，没有登录认证；安全边界主要指 AI 输入、动作和敏感配置的服务端约束。一次聊天请求链路：前端提交问题 → 后端读取当日业务摘要 → 检索长期记忆（Embedding 可用时融合关键词与向量评分，异常时退回关键词） → Agent 识别意图和安全边界 → 组装 Prompt → 调用模型或 fallback → 保存必要的 AI 洞察/记忆 → 返回内容、引用、trace 和建议动作 → 前端展示。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.AI2.1`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/11_AI应用系统工程师专项答案.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
