---
id: "embedded.Q6.4"
category: "网络协议"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["send", "短写", "EAGAIN", "SIGPIPE", "业务ACK", "幂等键"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# send() 成功是否代表对端应用已收到数据？短写如何处理？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 不代表。send() 成功通常只表示内核接受字节进入本地发送缓冲；即使对端 TCP 已 ACK，也不代表应用已读取或完成业务处理。需要业务确认时应由应用协议返回 ACK，并带消息序号或幂等键。阻塞与非阻塞 socket 都可能短写，应循环维护偏移量直到全部发送、发生不可恢复错误或超时；非阻塞遇到 EAGAIN/EWOULDBLOCK 应等待可写事件，EINTR 通常重试，还要处理连接关闭和 SIGPIPE。回答应区分“进入发送队列、TCP 确认、业务确认”三层，不声称一次 send() 完成整帧发送。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q6.4`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/05_网络与嵌入式Linux.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
