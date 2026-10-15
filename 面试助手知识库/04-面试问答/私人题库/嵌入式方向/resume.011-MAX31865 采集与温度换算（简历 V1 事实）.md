---
id: "resume.011"
category: "RS485/Modbus"
fact_status: "resume_fact"
review_status: "codex_draft"
evidence_status: "draft"
keywords: ["PT1000", "MAX31865", "Callendar-Van Dusen", "4300欧", "温度换算", "STM32F767"]
project_ids: ["ice_temperature"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# MAX31865 采集与温度换算（简历 V1 事实）

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> STM32F767 经 SPI2 读取 MAX31865 的 RTD 原始码，按 4300 Ω参考电阻换算 PT1000 阻值，再以 Callendar—Van Dusen 正温区公式解算温度。当前驱动未完整覆盖负温区公式与 fault 寄存器处理，因此这些内容列为后续补强，不写成已完成。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`resume.011`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/嵌入式Linux简历V1-三项目面试问答.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
