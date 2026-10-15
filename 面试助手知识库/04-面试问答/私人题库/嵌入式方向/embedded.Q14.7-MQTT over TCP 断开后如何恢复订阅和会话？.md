---
id: "embedded.Q14.7"
category: "物联网存储"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["指数退避", "重连抖动", "Session Present", "重订阅", "状态分层"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# MQTT over TCP 断开后如何恢复订阅和会话？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 检测到断链后，按有上限的指数退避策略依次重连网络、TCP 和 MQTT；连接成功后先根据会话是否恢复决定是否重新订阅，再恢复未确认消息和离线队列。MQTT 3.1.1 可检查 CONNACK 中的 Session Present 标志；若使用 clean session 或 Broker 已丢失会话，必须重新订阅。重连循环应加入抖动，避免大量设备同时冲击云端。连接状态机应区分 Wi-Fi、TCP、MQTT、订阅与业务就绪多个层级并分层计数失败；不要把 TCP 已连当作业务已恢复。；仅当订阅恢复且离线队列处理完成，业务才真正就绪，此前不发布业务数据；各层失败分别计数便于诊断。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q14.7`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/08_物联网存储与硬件调试.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
