---
id: "embedded.Q4.1"
category: "LinuxIPC"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "draft"
keywords: ["POSIX共享内存", "System V", "shm_open", "mmap", "文件桥", "未落地"]
project_ids: ["tof"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# POSIX 与 System V 共享内存有什么区别？项目实际用了哪个？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> POSIX 接口是 shm_open、ftruncate、mmap、shm_unlink；System V 接口是 shmget、shmat、shmdt、shmctl。两者都需要额外同步和生命周期管理。单光子当前源码未出现 shm_open、mmap 或 sem_open，实际 IPC 是 /tmp 文件桥。共享内存只是数据量增大后的候选升级方案，不作为项目完成项。

请同时查看 [[06-原始资料/阅读边界与缺失资料|版本差异说明]]，避免混用旧版与 V1 的协议、校验和架构描述。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q4.1`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/嵌入式Linux简历V1-三项目面试问答.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
