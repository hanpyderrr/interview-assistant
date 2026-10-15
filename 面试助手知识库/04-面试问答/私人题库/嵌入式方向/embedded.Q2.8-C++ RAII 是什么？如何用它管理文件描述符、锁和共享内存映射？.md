---
id: "embedded.Q2.8"
category: "C/C++基础"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["RAII", "UniqueFd", "lock_guard", "mmap", "munmap", "析构函数", "资源管理"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# C++ RAII 是什么？如何用它管理文件描述符、锁和共享内存映射？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> RAII 把资源获取与对象构造绑定，把资源释放放入析构函数。对象离开作用域时，无论正常返回还是抛异常，析构都会执行，从而减少泄漏和遗漏清理。文件描述符可封装为只移动的 UniqueFd，析构时 close；互斥锁用 std::lock_guard 或 std::unique_lock；mmap 返回的地址、长度可由自定义类或带自定义删除器的智能指针管理，析构时 munmap。资源类应禁止复制、允许安全移动，并清楚处理无效句柄。边界：进程被 SIGKILL、掉电或调用 _exit 时，用户态析构不会执行，因此命名共享内存、命名信号量等持久内核对象还需要启动时校验和明确的生命周期治理。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q2.8`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/02_C与C++基础.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
