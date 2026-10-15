---
id: "embedded.Q9.6"
category: "MIPI显示"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["分层排障", "modetest", "D-PHY", "DRM测试图", "QPA", "debugfs"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 如何区分显示控制器、DSI Host、Panel 驱动和应用层问题？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 从下到上分层验证：确认 panel 供电/复位/背光与初始化；检查 DSI Host/D-PHY 是否锁定、lane 和错误状态；检查显示控制器能否输出正确 mode/plane；最后用 DRM 测试图或 modetest 绕过 Qt，再检查 Qt 后端和应用纹理内容。固定测试图正常说明底层链路大概率可用，但不能证明所有格式和时序都正确；DRM 正常而 Qt 异常再查 QPA、EGL、像素格式和应用线程。内核日志、debugfs、寄存器、电源波形要形成交叉证据；若平台无 modetest 或 debugfs，应换用已有的最小显示程序。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q9.6`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/06_Qt显示与电机控制.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
