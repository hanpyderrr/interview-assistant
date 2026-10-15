---
id: "embedded.Q13.6"
category: "温度采集"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "draft"
keywords: ["STM32F767", "MAX31865", "裸机状态机", "采集周期", "批量上传"]
project_ids: ["ice_temperature"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 裸机多点采集如何安排采集、存储和上传节奏？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> STM32F767 当前是 while(1) 顺序执行，选通、MAX31865 读取、SD 写入和 ESP8266 发布会互相拉长周期。改进时用显式状态机和统一有效通道表，把测量、批量落盘、网络发布分阶段推进，并对每步设超时；先测一轮耗时，再决定是否需要定时器触发或任务化。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q13.6`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/嵌入式Linux简历V1-三项目面试问答.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
