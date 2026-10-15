---
id: "embedded.Q7.11"
category: "嵌入式Linux"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["dmesg", "probe", "设备树", "DMA", "regulator", "动态调试", "交叉验证"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# dmesg 中哪些信息能帮助定位 SPI、UART、DMA 或显示问题？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 关注驱动 probe 成败、设备树资源解析、时钟/复位/电源 regulator、GPIO/IRQ、DMA 通道申请、IOMMU/内存错误、串口溢出，以及 DRM/DSI bridge/panel 的绑定和 modeset 日志；结合时间戳看错误发生在启动、打开设备还是传输阶段。dmesg 只给内核视角，应用参数错误可能没有日志；日志级别过低时可启用动态调试或针对性 trace。不能仅凭一行错误下结论，要与设备树、寄存器/波形和应用返回码交叉验证。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q7.11`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/05_网络与嵌入式Linux.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
