---
id: "embedded.Q7.15"
category: "嵌入式Linux"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["只读挂载", "tmpfs", "logrotate", "fsync", "原子重命名", "掉电保护"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 如何实现只读根文件系统、日志轮转和断电可靠性？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 将系统分区只读挂载，把运行时写入放到 tmpfs 或独立可写数据分区；配置 logrotate 或有容量上限的环形日志，限制文件数和大小；关键数据采用追加记录、校验、双副本/原子重命名与 fsync，并选择支持崩溃恢复的文件系统和挂载策略。rename 的原子性不等于数据已落盘，目录元数据也可能需同步；tmpfs 日志掉电会丢失；频繁同步损耗性能与 Flash 寿命，需按数据价值取舍。只读根文件系统要求应用不隐式写 /etc、/var 等路径。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q7.15`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/05_网络与嵌入式Linux.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
