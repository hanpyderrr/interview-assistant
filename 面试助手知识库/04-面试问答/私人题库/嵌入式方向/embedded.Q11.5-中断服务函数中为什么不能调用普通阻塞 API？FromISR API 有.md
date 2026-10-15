---
id: "embedded.Q11.5"
category: "FreeRTOS"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["ISR", "FromISR", "pxHigherPriorityTaskWoken", "configMAX_SYSCALL_INTERRUPT_PRIORITY", "临界区"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 中断服务函数中为什么不能调用普通阻塞 API？FromISR API 有什么要求？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> ISR 不能睡眠或等待调度，普通阻塞 API 可能操作任务上下文并触发不适合中断环境的路径；应调用专用 xxxFromISR，阻塞时间为零，并通过 pxHigherPriorityTaskWoken 在退出中断前请求切换。ISR 应只清标志、搬少量数据并通知任务。可调用 RTOS API 的中断优先级必须满足 configMAX_SYSCALL_INTERRUPT_PRIORITY 限制；更高紧迫度中断不能调用这些 API。共享数据时 volatile 不提供互斥，应使用临界区、原子操作或队列。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q11.5`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/07_FreeRTOS与现场总线.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
