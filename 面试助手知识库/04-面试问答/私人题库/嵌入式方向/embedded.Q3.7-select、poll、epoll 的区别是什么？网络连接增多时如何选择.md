---
id: "embedded.Q3.7"
category: "Linux并发"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["select", "poll", "epoll", "水平触发", "边沿触发", "FD_SETSIZE", "EAGAIN"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# select、poll、epoll 的区别是什么？网络连接增多时如何选择？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> select 使用位图并受 FD_SETSIZE 限制，每次调用都要重建并扫描集合；poll 使用数组，没有固定 fd 编号上限，但仍线性扫描；epoll 在内核保留关注集并返回就绪事件，适合大量连接中只有少数活跃的场景。epoll 不会自动让少量连接更快；边沿触发通常要求非阻塞 fd 并一直读写到 EAGAIN。项目当前真实云联调暂缓，离线上传模块也不是大量 TCP 长连接场景；这道题按通用 Linux I/O 多路复用原理回答，不声称项目已用 epoll 或自定义 TCP 长连接。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q3.7`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/03_Linux并发与IPC.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
