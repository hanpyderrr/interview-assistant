---
id: "embedded.Q6.3"
category: "网络协议"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["三次握手", "四次挥手", "TIME_WAIT", "2MSL", "SYN", "FIN"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 什么是 TCP 三次握手和四次挥手？TIME_WAIT 的作用是什么？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 建连通过 SYN、SYN+ACK、ACK 同步双方初始序号并确认双向收发能力。TCP 是全双工，双方关闭发送方向通常分别需要 FIN 和 ACK，因此常见四次挥手；ACK 与 FIN 同时发送时也可能少于四个报文。主动关闭方通常进入 TIME_WAIT 等待 2MSL：让最后一个 ACK 丢失时可重发，并防止旧连接延迟报文污染相同四元组的新连接。大量短连接造成的端口压力应通过连接复用、合理的服务端/客户端角色和内核观测解决，不能粗暴取消 TIME_WAIT 语义。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q6.3`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/05_网络与嵌入式Linux.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
