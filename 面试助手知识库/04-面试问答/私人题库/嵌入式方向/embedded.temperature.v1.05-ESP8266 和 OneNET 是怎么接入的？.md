---
id: "embedded.temperature.v1.05"
category: "冰体多点温度采集系统 V1"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "draft"
keywords: ["ESP8266", "MQTT", "OneNET", "AT+MQTTPUB", "QoS0", "云端ACK"]
project_ids: ["ice_temperature"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# ESP8266 和 OneNET 是怎么接入的？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 主循环调用 `ESP8266_Init()` 完成模块联网和 MQTT 初始化，然后为每个测点拼接 OneNET 物模型属性上报命令，通过 `AT+MQTTPUB` 逐条发布。代码参数使用 QoS 0、retain 0；`ESP8266_SendCmd(..., "ok")` 判断的是模组对 AT 命令的响应，不是云端业务 ACK。当前版本没有可靠的应用层确认、离线队列、补传、遗嘱或持久会话实现，因此不能回答成“断网数据会进 Flash 并按序补传”。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.temperature.v1.05`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/嵌入式Linux简历V1-三项目面试问答.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
