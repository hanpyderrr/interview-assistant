---
id: "embedded.Q3.8"
category: "Linux并发"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["EINTR", "EAGAIN", "短读", "errno", "EOF", "事件循环", "重试"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 系统调用返回 EINTR、EAGAIN 或短读时应该如何处理？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> EINTR 表示调用被信号中断，若操作语义允许且没有完成有效工作，可重试，同时检查退出标志；EAGAIN/EWOULDBLOCK 表示非阻塞 fd 当前不能完成，应返回事件循环等待再次就绪，不能忙循环。短读表示只得到部分数据，应累计处理，而不是当作错误。原理：先看返回值再读 errno，只有返回失败时 errno 才有意义；某些调用被信号中断前已完成部分工作，必须保留进度；read 返回 0 对普通文件表示 EOF，对流式 socket 表示对端有序关闭；写也可能短写。项目结合：SPI/网络封装应返回已处理长度和明确状态，让上层解析缓存消费已有字节；退出时重试逻辑必须能被停止条件打断。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q3.8`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/03_Linux并发与IPC.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
