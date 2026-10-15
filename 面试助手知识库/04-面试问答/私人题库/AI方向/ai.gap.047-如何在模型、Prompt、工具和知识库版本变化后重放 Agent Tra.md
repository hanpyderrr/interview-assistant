---
id: "ai.gap.047"
category: "评测与学习闭环"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["Trace重放", "版本固定", "Playback", "Rerun", "非确定性", "回归检测", "统计显著性"]
project_ids: []
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 如何在模型、Prompt、工具和知识库版本变化后重放 Agent Trace，并区分非确定性波动与真实回归？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 如果由我设计，每条 Trace 都要固定输入、状态快照、模型与采样参数、Prompt 哈希、工具 schema、工具结果、知识库和索引版本。重放分两种：确定性 playback 复用历史模型与工具输出，验证状态机和代码变化；比较性 rerun 用新版本重新调用，评估整体行为变化。对概率输出不能单次判定，应在同一分层任务集上多次运行，比较成功率、工具轨迹、证据、延迟和成本的分布，并设置最小实际差异阈值。先用确定性断言发现 schema、权限和状态迁移回归，再用统计置信区间判断质量变化；只在特定切片显著且可复现的下降才判为真实回归。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.gap.047`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `research/ai-agent-interview-sources-20260828/question-answer-50-oral.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
