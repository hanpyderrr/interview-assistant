---
id: "embedded.Q13.5"
category: "温度采集"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "draft"
keywords: ["MAX31865", "STM32F767", "温度异常", "SPI波形", "故障定位"]
project_ids: ["ice_temperature"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 如何定位 MAX31865 多点温度异常？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 按原始 RTD 码与 fault 状态→SPI 波形→GPIO 选通地址→参考电阻与供电→替换已知正常 PT1000 的顺序排查。固定极值常见于开短路或换算错误，通道间串值优先查选通和稳定时间，稳定偏差再查线阻、开关电阻与校准。STM32F767 侧应保存通道号、原始码、温度和质量标志。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q13.5`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/嵌入式Linux简历V1-三项目面试问答.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
