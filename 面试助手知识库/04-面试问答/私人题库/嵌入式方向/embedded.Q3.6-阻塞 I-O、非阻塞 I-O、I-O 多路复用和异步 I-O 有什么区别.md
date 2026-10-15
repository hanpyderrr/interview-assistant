---
id: "embedded.Q3.6"
category: "Linux并发"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["阻塞IO", "非阻塞IO", "I/O多路复用", "异步IO", "epoll", "io_uring", "EAGAIN"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 阻塞 I/O、非阻塞 I/O、I/O 多路复用和异步 I/O 有什么区别？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 阻塞 I/O 在操作暂时不能完成时让调用线程睡眠；非阻塞 I/O 立即返回，暂不可用时通常给出 EAGAIN/EWOULDBLOCK。I/O 多路复用用 select/poll/epoll 等待多个 fd 的就绪事件，数据就绪后仍由应用调用 read/write。异步 I/O 提交请求后由内核在完成时通知，完成语义与仅就绪不同。边界：非阻塞不等于异步，忙轮询会浪费 CPU；多路复用也不保证一次读完整消息。Linux 上不同 AIO 接口支持的文件类型与语义不同，io_uring 是更现代的统一异步提交/完成机制，但复杂度更高。项目结合：采集设备若只有一个 fd 且读线程独占，阻塞读可能最简单；网络连接多或要同时处理定时器、信号时，epoll 更合适。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q3.6`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/03_Linux并发与IPC.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
