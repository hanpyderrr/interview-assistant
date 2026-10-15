---
id: "embedded.Q21.8"
category: "压力追问"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "draft"
keywords: ["STM32F767", "MAX31865", "温度架构图", "通道映射", "裸机", "OneNET"]
project_ids: ["ice_temperature"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 冰体多点温度系统的图和表应该补什么？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 架构图按 PT1000 阵列→GPIO 多级选通→MAX31865→STM32F767→FatFs/SD 与 ESP8266/OneNET 两个分支画。再补 0—108 通道映射表、当前 10 路有效配置、通道切换时序、按日文件样例和 MQTT 属性映射。图中明确工程为裸机顺序流程，不加入未在源码中启用的任务划分或远端节点状态机。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q21.8`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/嵌入式Linux简历V1-三项目面试问答.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
