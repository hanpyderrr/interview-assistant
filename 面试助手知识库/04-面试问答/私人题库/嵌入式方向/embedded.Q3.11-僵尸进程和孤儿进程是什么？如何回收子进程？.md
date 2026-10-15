---
id: "embedded.Q3.11"
category: "Linux并发"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["僵尸进程", "孤儿进程", "waitpid", "SIGCHLD", "WNOHANG", "SA_NOCLDWAIT"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 僵尸进程和孤儿进程是什么？如何回收子进程？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 子进程退出后，内核仍保留退出状态供父进程读取；父进程未 wait 时该条目是僵尸进程。父进程先退出，仍运行的子进程成为孤儿，会被 init/systemd 或子收割器接管。回收方式：父进程可同步或循环调用 waitpid，也可处理 SIGCHLD 后用 waitpid(-1, ..., WNOHANG) 循环回收所有已退出子进程；使用服务管理器时也要明确进程前后台模式和主 PID。边界：忽略 SIGCHLD 或设置 SA_NOCLDWAIT 在特定系统上可避免僵尸，但会放弃退出状态，且可移植语义要谨慎。孤儿不等于僵尸。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q3.11`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/03_Linux并发与IPC.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
