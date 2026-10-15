---
id: "project.genealogy.qa.003"
category: "族谱数字化 Agent"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "verified"
keywords: ["证据分层", "OCR候选", "模型建议", "确认事实", "区域ID"]
project_ids: ["genealogy_agent"]
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 为什么要把 OCR 候选、模型建议和确认事实分层？

> [!warning] 阅读边界
> 证据：源库标为已验证（verified）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> OCR 框只是候选文字，视觉模型给出的关系也可能是推断。如果直接写入最终族谱，后续很难判断哪句话来自原图、哪句话是模型补的。项目按区域 ID、坐标和证据类型保存候选，把模型建议放在待复核层，只有通过证据门禁的内容才进入确认层。这样可以重新跑模型，又不会覆盖已经确认的事实。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`project.genealogy.qa.003`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `kb/unified/six-project-evidence-audit.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
