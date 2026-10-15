---
id: "ai.AI2.2"
category: "PlanKiller 架构"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["技术选型", "FastAPI", "React", "Tauri", "Java/Spring", "桌面交付"]
project_ids: ["plankiller"]
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 为什么选择 FastAPI + React + Tauri，而不是纯 Web 或 Java/Spring？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 这是个人应用，目标是快速迭代和本地桌面交付。FastAPI 与 Python AI 生态、类型校验和异步 HTTP 集成成本低；React/TypeScript 适合组件化前端；Tauri 比完整 Chromium 桌面壳更轻，并能把 Python sidecar 集成到 Windows 安装包。Java/Spring 在企业级治理、团队规范和大规模服务中有优势，纯 Web 则部署简单但离线/本地数据体验较弱。选型不是说某技术更先进，而是匹配当前规模、团队和交付目标。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.AI2.2`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/11_AI应用系统工程师专项答案.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
