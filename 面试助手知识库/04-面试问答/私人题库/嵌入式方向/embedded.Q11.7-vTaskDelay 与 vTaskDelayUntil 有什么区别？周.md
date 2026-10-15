---
id: "embedded.Q11.7"
category: "FreeRTOS"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["vTaskDelay", "vTaskDelayUntil", "周期采集", "抖动", "超期检测", "xLastWakeTime"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# vTaskDelay 与 vTaskDelayUntil 有什么区别？周期采集应该用哪个？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> vTaskDelay 从调用时刻相对延迟，任务执行时间会累积进周期；vTaskDelayUntil 以固定唤醒基准计算下一次时间，更适合稳定周期采集。vTaskDelayUntil 减少长期漂移，但不能消除高优先级抢占、中断延迟和 Tick 分辨率造成的抖动；任务执行超过周期时要检测超期。采集循环保存 xLastWakeTime，每周期唤醒并记录实际时间戳；追问高精度时可使用硬件定时器触发采样，任务只处理结果。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q11.7`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/07_FreeRTOS与现场总线.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
