---
id: "resume.013"
category: "Flash/物联网"
fact_status: "resume_fact"
review_status: "codex_draft"
evidence_status: "draft"
keywords: ["STM32F767", "MAX31865", "ESP8266", "OneNET", "MQTT QoS0", "AT响应"]
project_ids: ["ice_temperature"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# ESP8266 与 OneNET 上传边界（简历 V1 事实）

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> STM32F767 通过 ESP8266 AT 指令将温度按 OneNET 物模型逐条发布，当前配置为 MQTT QoS 0、retain 0。代码中的 ok 是模组命令响应，不是云端业务确认；当前未实现可靠离线队列、应用层确认或恢复补发，因此简历只写 MQTT 上报。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`resume.013`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/嵌入式Linux简历V1-三项目面试问答.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
