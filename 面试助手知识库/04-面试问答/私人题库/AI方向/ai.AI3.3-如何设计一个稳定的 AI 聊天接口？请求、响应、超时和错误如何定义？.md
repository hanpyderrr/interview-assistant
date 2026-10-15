---
id: "ai.AI3.3"
category: "FastAPI"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["聊天接口", "request_id", "超时", "幂等", "错误定义", "可观测性"]
project_ids: []
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 如何设计一个稳定的 AI 聊天接口？请求、响应、超时和错误如何定义？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 请求至少包含 message、可选会话/目标日期和模型配置引用；响应可设计为包含 content、provider、引用记忆、trace、suggested_actions 和 request_id，其中 request_id 是推荐加入的可观测字段，不应说成当前项目已经完整实现。后端对消息长度、模型名称、URL 和用户权限校验，给上游设置连接/读取/总超时。把“HTTP 接口可用”和“上游模型成功”区分开，例如返回稳定的业务状态与 reason；敏感错误写日志而不回传 Token。对可重试错误设置有限重试，对用户动作使用幂等键。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.AI3.3`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/11_AI应用系统工程师专项答案.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
