---
id: "ai.AI4.2"
category: "模型接入"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["fallback", "local-fallback", "降级", "限流", "可诊断性"]
project_ids: ["plankiller"]
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# PlanKiller 为什么需要本地 fallback？fallback 应该返回什么，不能做什么？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 没有 Key、网络失败或模型限流时，核心计划工具仍应可用，所以 fallback 提供确定性的本地建议，例如基于当前计划和习惯生成简短提示，并明确 used_provider=local-fallback。它不能声称来自模型、不能编造事实、不能自动执行高风险动作，也不能无限重试上游。用户界面要告诉用户这是降级结果，日志保留失败类别。fallback 的目标是保持体验和可诊断性，不是替代高质量推理。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.AI4.2`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/11_AI应用系统工程师专项答案.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
