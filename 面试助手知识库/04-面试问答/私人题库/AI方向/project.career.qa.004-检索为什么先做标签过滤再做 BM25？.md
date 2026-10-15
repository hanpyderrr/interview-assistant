---
id: "project.career.qa.004"
category: "Career Evidence Lab"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "in_progress"
keywords: ["BM25", "标签过滤", "混合检索", "召回污染", "降级"]
project_ids: ["career_evidence_lab"]
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9506616"
---
# 检索为什么先做标签过滤再做 BM25？

> [!warning] 当前边界
> 共享知识库的岗位、项目和事实类型过滤及有界关键词评分已实现；当前算法不是 BM25，向量召回也未接入 Career Evidence Lab。

先尝试口述，再展开源库答案。

> [!note]- 当前口述答案
> 当前共享知识库先按目标岗位、允许项目和事实类型过滤：个人 `resume_fact` 不作为参考答案召回，岗位不匹配或项目越界的条目也不会进入候选集。之后对关键词、标题和正文分别赋权，并用项目命中加分，再稳定排序返回 top-k 和选择原因。这样先控制上下文边界，再讨论相关度。简历中“规划标签过滤、BM25 与可选向量召回”仍是后续方案；当前实现只能准确称为“有界加权关键词检索”，不能说 BM25 或向量检索已经落地，也还没有离线 Recall@k 评测。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`project.career.qa.004`
- 核对版本：`9506616`。
- 代码证据：`packages/knowledge/src/shared-kb.ts` 及对应测试。

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
