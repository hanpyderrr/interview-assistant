---
id: "embedded.Q7.5"
category: "嵌入式Linux"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["交叉编译", "sysroot", "aarch64", "ABI", "libc", "ELF interpreter"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 交叉编译器的三元组表示什么？sysroot 有什么作用？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 工具链前缀通常描述目标架构、厂商、系统/ABI，例如 aarch64-linux-gnu，实际可能是三元组或四元组。sysroot 是编译器看到的目标系统根，提供目标头文件、启动文件和库，使编译链接不误用宿主机资源。架构相同也可能因 libc、浮点 ABI 或指令集不兼容；排查需检查编译器 -dumpmachine、--sysroot、ELF interpreter、依赖库和目标机 ABI。回答真实工具链前缀和 libc 类型，未查证版本不要猜。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q7.5`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/05_网络与嵌入式Linux.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
