---
id: "ai.AI7.6"
category: "性能排查"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["性能排查", "request_id", "Performance", "TTFB", "P50/P95", "基线"]
project_ids: []
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 如果用户反馈“AI 页面很慢”，你如何从前端追到后端和模型服务？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 先用 request_id 和浏览器 Performance 看点击到请求发出、TTFB、响应解析和渲染；后端拆分 DB/记忆检索、Prompt 组装、网络连接、模型首 token/完整响应、后处理耗时；检查连接池、队列、重试和上下文 token。按 provider/model/输入大小比较 P50/P95，确认是前端阻塞、后端串行、检索慢还是上游排队。修复前建立基线，修复后验证质量没有因截断或降级过度下降。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.AI7.6`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/11_AI应用系统工程师专项答案.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
