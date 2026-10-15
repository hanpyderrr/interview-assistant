---
id: "embedded.Q14.5"
category: "物联网存储"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["Keep Alive", "遗嘱消息", "持久会话", "Clean Session", "MQTT5"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# Keep Alive、遗嘱消息和持久会话分别解决什么问题？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> Keep Alive 用周期通信或 PING 检测连接存活，超时后判定断链；遗嘱消息由 Broker 在客户端异常断开时代发，供其他系统感知设备离线；持久会话保存订阅和符合条件的离线消息/未完成 QoS 状态，恢复后可继续。正常发送 DISCONNECT 不触发遗嘱。MQTT 3.1.1 的 Clean Session 与 MQTT 5 的 Clean Start/Session Expiry 语义不同；持久会话不等于永久保存所有遥测。设备上线状态、遗嘱 Topic、保活周期与云端超时需协同设计，参数必须考虑弱网和功耗，并以平台限制为准。；实现时保活周期、遗嘱与云端超时需协同配置，弱网与功耗场景下参数须一并权衡，一切以平台限制为准。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q14.5`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/08_物联网存储与硬件调试.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
