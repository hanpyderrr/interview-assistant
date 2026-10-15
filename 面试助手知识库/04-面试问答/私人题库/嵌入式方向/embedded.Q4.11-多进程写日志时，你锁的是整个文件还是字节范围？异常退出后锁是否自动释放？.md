---
id: "embedded.Q4.11"
category: "LinuxIPC"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["日志锁", "l_start/l_len", "struct flock", "短写", "锁自动释放", "日志进程"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 多进程写日志时，你锁的是整个文件还是字节范围？异常退出后锁是否自动释放？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 当前版本各进程主要写独立日志，尚未实装 fcntl 统一日志锁，因此不能声称已实测 l_start/l_len 的某个配置。如果升级成统一事件日志，会设 l_whence=SEEK_SET、l_start=0、l_len=0，表示从文件开头到 EOF 的整文件写锁。正确流程是锁外拼好一整行，F_SETLKW 阻塞获锁，处理 EINTR 和短写，写完后 F_UNLCK。内核管理的记录锁会在进程退出或相关描述符关闭时释放，但进程在 write 中被强制终止仍可能留下残缺日志行。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q4.11`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/03_Linux并发与IPC.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
