---
id: "embedded.Q11.13"
category: "FreeRTOS"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["HardFault", "EXC_RETURN", "CFSR", "MSP/PSP", "栈帧", "反查源码"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 如何调试 HardFault？需要查看哪些寄存器和调用栈？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 先在 HardFault 入口根据 LR 的 EXC_RETURN 判断使用 MSP 还是 PSP，保存栈帧中的 R0-R3、R12、LR、PC、xPSR，再查看 SCB 的 CFSR、HFSR、MMFAR、BFAR 和 SHCSR。CFSR 可区分存储、总线和用法错误；地址有效位成立时 MMFAR/BFAR 才可信。用带符号的 ELF 和 map 文件把故障 PC/LR 反查到源码，并检查任务栈是否越界。可将最小故障上下文写入保留 RAM/Flash，重启后导出；不得在故障处理器里执行复杂日志。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q11.13`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/07_FreeRTOS与现场总线.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
