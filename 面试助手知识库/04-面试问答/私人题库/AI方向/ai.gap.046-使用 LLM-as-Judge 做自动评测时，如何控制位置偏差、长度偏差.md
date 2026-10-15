---
id: "ai.gap.046"
category: "评测与学习闭环"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["LLM-as-Judge", "位置偏差", "长度偏差", "自洽偏差", "人工校准", "评测漂移"]
project_ids: []
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 使用 LLM-as-Judge 做自动评测时，如何控制位置偏差、长度偏差、自洽偏差并校准到人工标准？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> LLM-as-Judge 可扩展语义评测，但不能当绝对真值。位置偏差可交换 A/B 顺序并取一致结果，或改用独立打分；长度偏差用明确 rubric，只按正确性、证据和完成度评分，并加入长而错误、短而完整的对抗样例；自洽偏差要避免 Judge 评自己的输出，尽量用不同模型族、隐藏来源并提供证据。校准时由多名人工按同一 rubric 标注分层样本，计算一致性和分段误差后调阈值；低一致、临界和高风险样本回流人工，并监控版本漂移。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.gap.046`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `research/ai-agent-interview-sources-20260828/question-answer-50-oral.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
