---
id: "embedded.Q9.2"
category: "MIPI显示"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["DSI Host", "时序参数", "hfp/hbp", "初始化命令", "regulator", "背光"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 调试 MIPI-DSI 屏时涉及哪些设备树节点、时序参数、电源和复位信号？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 通常涉及显示控制器、DSI Host/D-PHY、panel 或 bridge、endpoint 连接图、时钟/复位、regulator、背光和 GPIO。关键参数包括 lane 数及映射、像素格式、视频/命令模式、mode flags、像素时钟和 hactive/hfp/hsync/hbp、vactive/vfp/vsync/vbp，以及面板初始化命令和延时。先按 datasheet 的上电顺序使电源稳定，再拉复位并发送初始化命令，最后开视频流和背光；不同 panel binding 属性不同。背光亮不代表 DSI 数据正确，屏不亮也可能仅是背光链路问题。修改值和 delay 只按实际记录回答。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q9.2`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/06_Qt显示与电机控制.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
