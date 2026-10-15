---
id: "project.career.qa.005"
category: "Career Evidence Lab"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "in_progress"
keywords: ["十题面试", "动态选题", "有界追问", "追问预算", "JD权重"]
project_ids: ["career_evidence_lab"]
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "fe81704+working-tree"
---
# 十题动态面试和有界追问如何设计？

> [!warning] 当前边界
> 固定十题的离线面试、持久化和恢复已实现；模型动态选题与有界追问仍在开发。

先尝试口述，再展开源库答案。

> [!note]- 当前口述答案
> 已交付的基线是固定十道题的离线面试，会话、回答和报告存入 SQLite，支持关闭重开恢复。动态版本在此基础上增加 Interview Agent：每道主问题最多两次追问，全场最多六次；追问必须针对当前回答中的具体缺口。Judge 和 Fact 使用同一回答快照，模型异常后本场永久降级到离线流程，避免反复消耗请求。当前预算和角色契约已有实现与测试，真实 Electron 的动态全流程尚未完成，所以面试时要把“离线十题已完成”和“动态有界追问在研”分开说。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`project.career.qa.005`
- 已提交基线：`fe81704`。
- 在研证据：2026-09-07/09 `progress.md` 与当前模型契约工作树。

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
