---
id: "ai.gap.029"
category: "评测与学习闭环"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["Agent评测", "Tool Use", "轨迹质量", "Recall@k", "回归测试", "LLM-as-Judge", "版本追踪"]
project_ids: []
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 如何设计 Agent 评测体系，包括 Tool Use 准确率、轨迹质量和检索 recall@k？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 如果由我设计，会把评测分成结果、过程和运行指标三层。结果层看任务是否完成、答案是否有证据；Tool Use 不只评工具名，还评参数、调用时机、业务成功、重复与越权；轨迹质量评步骤必要性、顺序、循环、恢复和成本；检索用带证据标注的问题计算 recall@k、MRR 和引用覆盖。评测集按真实任务类型、难度和风险分层，包含正常、对抗和故障样本。确定性指标优先，模型裁判只处理语义项并做人工校准。上线前离线回归，上线后做抽样观测与用户结果闭环，所有分数绑定模型、Prompt、工具和知识库版本。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.gap.029`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `research/ai-agent-interview-sources-20260828/question-answer-50-oral.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
