---
id: "embedded.Q11.6"
category: "FreeRTOS"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["任务栈", "栈溢出", "uxTaskGetStackHighWaterMark", "StackType_t", "溢出钩子"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 如何估算任务栈大小？如何检测栈溢出和剩余栈空间？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 根据最深调用链、局部变量、库函数、异常上下文和架构对齐估算，再用压力场景实测留余量。用 uxTaskGetStackHighWaterMark 看历史最小剩余量，并启用 configCHECK_FOR_STACK_OVERFLOW 和溢出钩子。FreeRTOS 创建任务时的栈深度常以 StackType_t 个数而非字节计；递归、大数组、printf 浮点格式化会显著耗栈；高水位只反映已跑路径。在通信突发、错误恢复和日志全开场景采集高水位；大缓冲改为静态/堆区；最终栈值应引用实测，不虚构余量。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q11.6`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/07_FreeRTOS与现场总线.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
