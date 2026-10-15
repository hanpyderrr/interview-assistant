---
id: "embedded.Q20.14"
category: "压力追问"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "draft"
keywords: ["STM32F767", "MAX31865", "稳定时间", "GPIO", "SPI", "重复性"]
project_ids: ["ice_temperature"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 温度项目如何确定通道切换后的稳定时间？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 实际要观察 STM32F767 输出选通信号后 MAX31865 原始 RTD 码的收敛，用示波器或逻辑分析仪确认 GPIO/SPI 时序，再在固定温点重复采样比较不同等待时间的均值和方差。选择满足误差要求的最短稳定时间并留裕量。当前源码资料没有完整测试值，所以只讲测量方法，不报固定毫秒数。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q20.14`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/嵌入式Linux简历V1-三项目面试问答.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
