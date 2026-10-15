---
id: "embedded.Q11.11"
category: "FreeRTOS"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["NVIC", "优先级分组", "configMAX_SYSCALL_INTERRUPT_PRIORITY", "Cortex-M", "抢占优先级"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# STM32 中断优先级分组和 FreeRTOS 可调用 API 的中断优先级限制是什么？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> Cortex-M 的优先级数值越小、紧迫度越高；分组决定抢占优先级和子优先级位数。调用 FromISR API 的中断，其抢占优先级必须在 FreeRTOS 允许范围内，即数值不小于 configLIBRARY_MAX_SYSCALL_INTERRUPT_PRIORITY（注意移位后的配置形式）。configMAX_SYSCALL_INTERRUPT_PRIORITY 与 CMSIS 未移位优先级不能直接混用；零优先级等高紧迫中断不可调用 RTOS API；分组必须与配置假设一致。具体位数由 STM32 型号的 __NVIC_PRIO_BITS 决定。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q11.11`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/07_FreeRTOS与现场总线.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
