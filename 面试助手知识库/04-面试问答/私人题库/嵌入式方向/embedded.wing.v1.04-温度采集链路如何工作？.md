---
id: "embedded.wing.v1.04"
category: "机翼结冰探测系统 V1"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "draft"
keywords: ["MAX31865", "PT1000", "温度采集", "测温"]
project_ids: ["wing_icing"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 温度采集链路如何工作？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> MAX31865 把 PT1000 的阻值转换为数字量，经 SPI 交给 STM32；温度数据与扫频结果一起作为结冰状态分析输入。当前最新版简历不再描述加热控制或任何控制下行，知识库也不能从旧资料恢复这类表述。PT1000 线制、参考电阻、故障处理和温度字段格式仍需查原始硬件与固件。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.wing.v1.04`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/嵌入式Linux简历V1-三项目面试问答.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
