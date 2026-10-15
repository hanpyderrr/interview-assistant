---
id: "embedded.Q14.3"
category: "物联网存储"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["MQTT", "Broker", "Topic", "Retain", "通配符订阅", "OneNET"]
project_ids: ["ice_temperature"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# MQTT 发布/订阅模型：Client、Broker、Topic 分别是什么？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> Client 连接 Broker，向 Topic 发布消息或订阅 Topic；Broker 负责认证、路由并按会话/QoS 规则转发给匹配订阅者。Topic 是分层主题名，订阅可使用通配符。发布者与订阅者在空间和时间上解耦，但 MQTT 不定义业务数据语义；Topic 不是消息队列实体，是否保留最后消息由 Retain 标志决定，离线消息还取决于 QoS 级别和会话配置。设备侧应按产品/设备/消息类型规划 Topic，并在云端配置最小权限；具体 OneNET 的 Topic 结构和鉴权格式按实际平台版本说明。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q14.3`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/08_物联网存储与硬件调试.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
