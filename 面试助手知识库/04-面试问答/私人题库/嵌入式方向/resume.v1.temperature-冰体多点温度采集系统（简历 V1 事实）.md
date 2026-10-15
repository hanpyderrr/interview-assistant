---
id: "resume.v1.temperature"
category: "简历 V1 项目事实"
fact_status: "resume_fact"
review_status: "codex_draft"
evidence_status: "draft"
keywords: ["STM32F767", "PT1000", "MAX31865", "109通道", "10路验证", "OneNET", "FatFs", "SD卡", "RTC", "按日文件", "数据记录", "ESP8266", "MQTT", "OneNET", "AT+MQTTPUB", "QoS0", "云端ACK"]
project_ids: ["ice_temperature"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 冰体多点温度采集系统（简历 V1 事实）

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 冰体多点温度采集系统基于 STM32F767、PT1000 和 MAX31865。固件通过多级 GPIO 地址选通复用采集前端，完成 109 个测点的通道寻址代码，当前主循环保留 10 路验证配置；数据由 RTC 标记后经 FatFs 追加写入 SD 卡，并由 ESP8266 通过 MQTT QoS 0 发布到 OneNET。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`resume.v1.temperature`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/韩忠毅-太原理工-嵌入式Linux应用开发-2026-08-16-1版.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
