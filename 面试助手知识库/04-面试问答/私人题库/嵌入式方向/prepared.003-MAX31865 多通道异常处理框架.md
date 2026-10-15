---
id: "prepared.003"
category: "RS485/Modbus"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "draft"
keywords: ["STM32F767", "MAX31865", "PT1000", "故障处理", "SPI波形"]
project_ids: ["ice_temperature"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# MAX31865 多通道异常处理框架

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 先按通道记录 STM32F767 读取到的 MAX31865 原始 RTD 码与 fault 状态，再检查 GPIO 选通地址、SPI 波形、参考电阻、供电和 PT1000 接线。对开短路、换算越界、通道串值和稳定偏差分类处理；没有实际阈值与故障注入记录前，只给排查路径，不虚构恢复成功率。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`prepared.003`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/嵌入式Linux简历V1-三项目面试问答.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
