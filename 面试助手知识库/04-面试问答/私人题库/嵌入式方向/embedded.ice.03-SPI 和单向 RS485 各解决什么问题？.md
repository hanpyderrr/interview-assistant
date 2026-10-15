---
id: "embedded.ice.03"
category: "机翼结冰项目"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "draft"
keywords: ["SPI", "单向RS485", "A端发送", "B端只接收", "板内通信", "远距离通信"]
project_ids: ["wing_icing"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# SPI 和单向 RS485 各解决什么问题？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> SPI 用于 STM32 配置 AD5940 并读取测量结果，解决板内同步通信；RS485 用于把结果从 A 端单向传到距离更远的 B 端，利用差分信号提高抗干扰能力。现有资料不能确认 SPI 模式与速率，也不能确认 RS485 波特率、帧格式、发送周期、CRC 和失联阈值。没有原始固件前，不把 DMA 双缓冲或中断通知写成已经完成。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.ice.03`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/嵌入式Linux简历V1-三项目面试问答.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
