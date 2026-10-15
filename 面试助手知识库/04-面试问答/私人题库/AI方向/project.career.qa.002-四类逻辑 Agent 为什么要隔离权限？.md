---
id: "project.career.qa.002"
category: "Career Evidence Lab"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "in_progress"
keywords: ["多Agent", "权限矩阵", "最小权限", "面试官Agent", "评分Agent"]
project_ids: ["career_evidence_lab"]
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9506616+working-tree"
---
# 四类逻辑 Agent 为什么要隔离权限？

> [!warning] 当前边界
> 离线面试、事实审核和模型安全设置已完成；Interview、Judge、Fact 三角色的严格契约、模型 Worker 与 Gateway 正在实现，真实动态编排闭环尚未收口；Coach 仍是后续角色。

先尝试口述，再展开源库答案。

> [!note]- 当前口述答案
> 拆角色的目的，是让模型每次只拿到完成当前任务所需的输入，并用不同 Schema 限制输出。Interview 只能决定主问题或有界追问；Judge 只依据当前问题、回答和允许的证据评分；Fact 只能引用回答原文提交候选建议，不能直接写正式事实；Coach 将来只消费评分和已确认事实生成训练建议。正式事实仍由用户审核和存储事务控制。当前三种动态角色的契约和调用底座已在开发分支实现并通过单元验证，但完整 Electron 编排尚未完成，因此应说“权限模型已设计并部分实现”，不能说四 Agent 已全部上线。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`project.career.qa.002`
- 已提交基础：`06b8f4d`、`9506616`。
- 在研证据：`packages/contracts/src/model-provider.ts`、`apps/desktop/src/model/model-provider-worker.ts`、`apps/desktop/src/main/model/utility-model-gateway.ts`。

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
