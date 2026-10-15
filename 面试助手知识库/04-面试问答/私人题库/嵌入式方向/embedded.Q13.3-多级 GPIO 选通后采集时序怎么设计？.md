---
id: "embedded.Q13.3"
category: "温度采集"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "draft"
keywords: ["STM32F767", "GPIO选通", "MAX31865", "通道切换", "稳定时间"]
project_ids: ["ice_temperature"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 多级 GPIO 选通后采集时序怎么设计？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 先输出一级、二级和 3 bit 子通道地址，再等待模拟开关、引线和 MAX31865 输入稳定，随后触发读取；通道切换与读取必须串行对应，结果按通道 ID 入表。当前 STM32F767 工程有 0—108 的映射，但主循环只验证前 10 路，延时应由示波器和重复性测试确定。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q13.3`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/嵌入式Linux简历V1-三项目面试问答.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
