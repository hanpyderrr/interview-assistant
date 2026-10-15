---
id: "resume.003"
category: "SPI/协议"
fact_status: "resume_fact"
review_status: "none"
evidence_status: "draft"
keywords: ["SPI", "read", "ioctl", "状态机", "帧同步", "CRC32"]
project_ids: ["tof"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# SPI设备接口与协议解析

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：未设置审核（none）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 项目中使用 C/C++ 封装 SPI 字符设备接口，通过状态机完成 SPI 字节流帧同步与协议字段解析：深度帧为 TofFrame（v1 2070B 纯深度 / v2 4118B 深度+强度，magic TOFP 同步、小端、CRC16-Modbus 校验），校验失败丢帧计数、不重传。

请同时查看 [[06-原始资料/阅读边界与缺失资料|版本差异说明]]，避免混用旧版与 V1 的协议、校验和架构描述。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`resume.003`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/个人信息.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
