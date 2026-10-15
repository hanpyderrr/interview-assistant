---
id: "ai.AI2.4"
category: "PlanKiller 架构"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["fallback", "超时", "异常捕获", "熔断", "限流", "provider"]
project_ids: ["plankiller"]
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 你如何处理 AI 服务不可用而不能影响计划、习惯和复盘功能的问题？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> AI 调用设置超时和异常捕获，失败时返回本地 fallback，并在响应中标明实际 provider；普通 CRUD 不依赖 AI 请求才能完成，提醒任务也有独立流程。前端区分加载、真实模型、fallback 和错误状态，后端日志记录失败原因但不泄露 Key。更高规模的系统还应加熔断、限流、重试预算、队列和降级等级。fallback 只能提供有限、可解释的本地建议，不能伪装成模型已经完成复杂推理。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.AI2.4`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/11_AI应用系统工程师专项答案.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
