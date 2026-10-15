---
id: "project.genealogy.qa.005"
category: "族谱数字化 Agent"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "verified"
keywords: ["PP-OCRv5", "mobile模型", "server模型", "CPU推理", "模型选型"]
project_ids: ["genealogy_agent"]
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 为什么选择 PP-OCRv5 mobile，而不是 server 模型？

> [!warning] 阅读边界
> 证据：源库标为已验证（verified）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 项目先在六类页面上做冒烟比较。server 模型在当前 CPU 环境中单页耗时约 1100 秒，不适合 22 页批处理；mobile 检测和识别模型的处理时间约 0.57 至 3.70 秒每页，matched-box 复核中识别质量接近 server 方案。因此第一轮批量候选使用 mobile 模型，把低清字和复杂版面交给后续复核。这个选择是资源、速度和复核成本之间的取舍。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`project.genealogy.qa.005`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `kb/unified/six-project-evidence-audit.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
