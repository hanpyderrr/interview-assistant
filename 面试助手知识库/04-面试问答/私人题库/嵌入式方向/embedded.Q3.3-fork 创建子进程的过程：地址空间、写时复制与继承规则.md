---
id: "embedded.Q3.3"
category: "Linux并发"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["fork", "写时复制", "open file description", "MAP_SHARED", "waitpid", "exec"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# fork 创建子进程的过程：地址空间、写时复制与继承规则

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 说明：源文件此题缺少问题文本，本标题按答案内容重构，待对照原清单确认。fork 创建几乎相同的子进程。父子进程有独立虚拟地址空间，但初始物理页通常通过写时复制共享；任一方写某页时内核才复制该页。子进程继承打开的文件描述符，描述符引用同一 open file description，因此文件偏移和部分状态共享；信号处置、环境、工作目录等也按规则继承。边界：普通内存后续修改彼此不可见，MAP_SHARED 映射可继续共享；子进程有独立 PID、资源统计和挂起信号集合；锁与多线程状态在 fork 后尤其危险，多线程程序中子进程在 exec 前只宜调用异步信号安全函数。常见流程是 fork 后子进程 exec，父进程用 waitpid 回收。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q3.3`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/03_Linux并发与IPC.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
