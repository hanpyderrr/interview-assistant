---
id: "embedded.Q3.14"
category: "Linux并发"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["top", "perf", "strace", "gdb", "core dump", "ASan", "Valgrind", "futex"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 如何定位 Linux 程序的 CPU 高占用、内存泄漏、线程阻塞和崩溃？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 先确认现象、时间窗口和可复现输入，再分层取证。CPU 高占用用 top -H/pidstat 找线程，perf top/record 看热点；内存用 /proc/pid/status、smaps、pmap 区分堆、映射和缓存，测试环境配合 ASan/LSan 或 Valgrind；阻塞用 ps、线程栈、strace -f、gdb 判断在锁、futex 还是 I/O；崩溃保留 core、可执行文件和匹配符号，用 gdb 回溯。边界：RSS 增长不一定是泄漏，可能是页缓存或 allocator 未归还；高 CPU 也可能来自忙等或中断负载；采样工具通常比全量跟踪开销低。项目结合：多进程系统还应给日志带进程名、PID、帧序号和时间戳，以关联采集、处理、显示和上传阶段。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q3.14`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/03_Linux并发与IPC.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
