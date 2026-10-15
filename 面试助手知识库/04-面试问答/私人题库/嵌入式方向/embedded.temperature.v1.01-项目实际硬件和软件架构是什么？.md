---
id: "embedded.temperature.v1.01"
category: "冰体多点温度采集系统 V1"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "draft"
keywords: ["STM32F767", "PT1000", "MAX31865", "109通道", "10路验证", "OneNET"]
project_ids: ["ice_temperature"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 项目实际硬件和软件架构是什么？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 现有 Keil 工程的目标器件是 STM32F767IGTx，不是 STM32F407。测温链路为 PT1000 铂电阻、MAX31865 和 SPI2；GPIO 选择信号切换多级模拟通道，复用一套 MAX31865 采集前端。固件完成了 109 个测点的寻址分支，`MAX31865_data` 数组容量为 110；但当前主循环只遍历前 10 路，是调试验证配置。采集结果写入 SD 卡，并通过 ESP8266 以 MQTT 发布到 OneNET。工程是裸机 `while(1)`，没有启用 FreeRTOS、DS18B20、Modbus 或 RS485。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.temperature.v1.01`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/嵌入式Linux简历V1-三项目面试问答.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
