---
id: "ai.gap.016"
category: "身份与权限"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["OAuth", "JWT", "RBAC", "ABAC", "委托令牌", "服务身份", "审计链"]
project_ids: []
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 多用户 AI 系统如何设计 JWT/OAuth、RBAC/ABAC、服务身份和工具授权继承，并保证审计主体可追踪？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 如果由我设计，用户登录由 OAuth/OIDC 完成，短期 JWT 只承载稳定身份、租户和必要 scope，不放动态权限。网关验证签名、issuer、audience 与过期时间，授权服务再结合 RBAC 的角色基线和 ABAC 的资源、租户、时间、风险属性做决策。Agent 和子任务不能继承平台全权，而应获得绑定用户、任务、工具和期限的委托令牌；工具端必须再次校验。后台服务用独立 workload identity，禁止冒充用户。审计事件同时记录真实用户、代理 Agent、调用服务、授权依据和资源，形成 actor、delegator、subject 链，确保每个副作用都能追溯。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.gap.016`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `research/ai-agent-interview-sources-20260828/question-answer-50-oral.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
