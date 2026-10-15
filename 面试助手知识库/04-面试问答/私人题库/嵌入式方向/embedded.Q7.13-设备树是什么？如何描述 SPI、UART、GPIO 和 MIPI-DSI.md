---
id: "embedded.Q7.13"
category: "嵌入式Linux"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["设备树", "DTS", "compatible", "phandle", "binding", "MIPI-DSI", "endpoint"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 设备树是什么？如何描述 SPI、UART、GPIO 和 MIPI-DSI 设备？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 设备树是对不可自动枚举硬件及其连接关系的结构化描述；内核驱动通过 compatible 匹配节点并获取地址、中断、时钟、复位、电源和 GPIO 等资源。SPI 用控制器下的从设备及片选/频率描述；UART 配引脚和状态；GPIO 通过 phandle 加标志引用；MIPI-DSI 通常还需 host、panel/bridge、endpoint graph、lane 和显示时序。设备树描述硬件而非业务策略；属性名和 binding 必须遵循对应内核 YAML/文档，不能任意创造；节点 status="okay" 也不保证 probe 成功。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q7.13`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/05_网络与嵌入式Linux.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
