---
id: "project.career.qa.001"
category: "Career Evidence Lab"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "verified"
keywords: ["事实状态机", "待确认", "冲突事实", "事实边界", "幻觉"]
project_ids: ["career_evidence_lab"]
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "06b8f4d"
---
# 为什么要设计候选人事实状态机？

> [!note] 当前证据
> 事实提取、审核和版本存储已经实现并通过真实 Electron 链路验证；状态名称应按具体对象回答，不能随意把候选事实、事实建议和正式事实的状态混为一组。

先尝试口述，再展开源库答案。

> [!note]- 当前口述答案
> 文档解析和面试回答只能产生候选内容，不能自动变成简历事实。当前实现会把文档事实绑定来源锚点，把面试建议绑定 session、answer、question、题目文本和回答逐字引文；建议经过 pending、confirmed、rejected 或 conflict 等审核状态。只有用户明确确认后，系统才原子创建 canonical interview fact，并保留版本与来源。伪造引文、跨会话绑定、非法状态转换和重复审核都会失败关闭。这样能防止模型把推断反复引用成个人事实，也使新一场面试能基于已确认内容重建 SessionPack。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`project.career.qa.001`
- 核对版本：`06b8f4d`。
- 代码证据：`packages/storage/src/fact-suggestion-store.*`、`candidate-repository.ts`、SQLite schema v3。

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
