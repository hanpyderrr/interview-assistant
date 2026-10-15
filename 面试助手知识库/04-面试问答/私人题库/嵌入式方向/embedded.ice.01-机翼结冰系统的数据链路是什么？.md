---
id: "embedded.ice.01"
category: "机翼结冰项目"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "draft"
keywords: ["机翼结冰", "AD5940", "4kHz-150kHz", "单向RS485", "A端发送", "B端只接收", "PT1000"]
project_ids: ["wing_icing"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 机翼结冰系统的数据链路是什么？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> STM32 通过 SPI 配置并读取 AD5940，对机翼前缘电容传感器进行 4 kHz—150 kHz 扫频；测量结果由 A 端经单向 RS485 物理链路发送，B 端只接收，为上位机后续冰型识别和厚度预测提供输入。MAX31865 和 PT1000 用于采集结冰区域温度。当前只确认 A 端发送、B 端接收，不在这条链路上描述控制下行；协议帧、波特率、发送周期、CRC 和失联阈值仍需查原始固件或记录。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.ice.01`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/嵌入式Linux简历V1-三项目面试问答.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
