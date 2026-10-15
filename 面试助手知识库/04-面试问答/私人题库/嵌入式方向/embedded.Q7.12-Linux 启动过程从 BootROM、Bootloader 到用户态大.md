---
id: "embedded.Q7.12"
category: "嵌入式Linux"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["BootROM", "Bootloader", "initramfs", "PID 1", "设备树", "SPL", "TF-A"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# Linux 启动过程从 BootROM、Bootloader 到用户态大致经历什么？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> SoC 复位后 BootROM 从选定介质装载首级引导；Bootloader 完成更完整的 DDR、时钟和外设初始化，加载内核、DTB 和可选 initramfs；内核解压、初始化内存/调度/驱动并挂载根文件系统，最后执行 PID 1，由 init 启动服务和应用。实际可能有 SPL/TF-A/安全启动等多个阶段，顺序依 SoC 而定。设备树由 Bootloader 传给内核；根文件系统既可内置、块设备挂载，也可网络挂载。按实际启动日志说明各阶段和耗时，不知道芯片安全启动链时不要补全想象。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q7.12`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/05_网络与嵌入式Linux.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
