---
id: "project.career.qa.003"
category: "Career Evidence Lab"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "verified"
keywords: ["不可变快照", "AnswerSnapshot", "可追溯", "重试", "幂等"]
project_ids: ["career_evidence_lab"]
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "fe81704"
---
# 为什么回答要保存不可变快照？

> [!note] 当前证据
> 回答快照、会话恢复、幂等重放和完成报告已经以 SQLite 为权威实现，并通过重启和双连接竞态测试。

先尝试口述，再展开源库答案。

> [!note]- 当前口述答案
> 如果评分、事实提取和追问读取的是可变文本，同一轮处理可能依据不同版本。当前系统每次提交回答都写入不可变 answer snapshot，评分、事实建议和报告通过 ID 引用同一份原文；完成报告也按会话冻结。operationId 与 request hash 支持精确重放，CAS 和事务保证并发提交不会产生部分写。关闭并重开应用后，会话能恢复到正确题号，已完成报告保持一致。后续修订应产生新版本，不覆盖历史证据。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`project.career.qa.003`
- 核对版本：`fe81704`。
- 代码证据：`packages/storage/src/interview-store.ts`、会话与集成测试。

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
