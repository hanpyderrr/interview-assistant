---
id: "embedded.Q9.1"
category: "MIPI显示"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["MIPI-DSI", "D-PHY", "DRM/KMS", "LVDS", "HDMI", "panel/bridge"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# MIPI-DSI 在显示链路中处于什么位置？与 RGB、LVDS、HDMI 有何区别？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 典型链路是应用/合成器→DRM/KMS 显示控制器→DSI Host→MIPI D-PHY→panel/bridge。DSI 是面向移动/嵌入式显示的高速串行接口，支持视频模式和命令模式；并行 RGB 引脚多、距离短；LVDS 是低压差分串行物理传输，常见于屏连接；HDMI 面向标准化外部音视频接口，带完善的链路与设备协商。这些名词跨越不同协议层，不能只按“速度”比较。某些面板通过 bridge 将 DSI 转 LVDS/HDMI，实际拓扑需看原理图和设备树。按真实 SoC、lane 数、panel/bridge 拓扑回答，未确认时不猜。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q9.1`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/06_Qt显示与电机控制.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
