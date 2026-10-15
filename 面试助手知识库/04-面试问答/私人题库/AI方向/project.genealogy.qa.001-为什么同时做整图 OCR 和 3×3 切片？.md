---
id: "project.genealogy.qa.001"
category: "族谱数字化 Agent"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "verified"
keywords: ["整图OCR", "3x3切片", "切片去重", "召回率", "坐标"]
project_ids: ["genealogy_agent"]
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 为什么同时做整图 OCR 和 3×3 切片？

> [!warning] 阅读边界
> 证据：源库标为已验证（verified）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 整图保留版面上下文，但超高分辨率页面缩放后小字容易丢失；切片能保留局部字形，却可能把跨块文字切断并产生重复框。因此流程同时保留两路候选，再按坐标和交集比例做去重，来源坐标也一并留下，便于后续复核。切片提高的是候选召回，不代表结果可以直接定稿。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`project.genealogy.qa.001`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `kb/unified/six-project-evidence-audit.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
