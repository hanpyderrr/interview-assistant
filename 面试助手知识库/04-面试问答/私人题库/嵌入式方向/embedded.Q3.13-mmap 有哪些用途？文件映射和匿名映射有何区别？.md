---
id: "embedded.Q3.13"
category: "Linux并发"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["mmap", "文件映射", "匿名映射", "MAP_SHARED", "MAP_PRIVATE", "SIGBUS", "shm_open"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# mmap 有哪些用途？文件映射和匿名映射有何区别？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> mmap 可用于文件访问、共享库装载、进程间共享内存、分配大块匿名内存及映射设备。文件映射以文件或共享内存对象为后备；匿名映射没有普通文件后备，初始通常为零页，可在 fork 继承后配合 MAP_SHARED 做亲缘进程共享。边界：MAP_SHARED 的修改可被其他映射者看到并可按语义回写；MAP_PRIVATE 是写时复制，修改不回写原文件。映射长度、偏移必须满足要求，访问被截断文件的映射区可能触发 SIGBUS。mmap 减少某些复制不等于没有页故障、缓存维护或同步成本。项目结合：POSIX 共享内存通常是 shm_open 得到 fd，ftruncate 定尺寸，再 mmap 以 MAP_SHARED 映射。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q3.13`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/03_Linux并发与IPC.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
