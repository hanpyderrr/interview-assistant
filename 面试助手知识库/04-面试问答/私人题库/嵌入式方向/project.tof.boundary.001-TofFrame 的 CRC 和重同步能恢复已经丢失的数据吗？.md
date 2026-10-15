---
id: "project.tof.boundary.001"
category: "单光子 TOF"
fact_status: "resume_fact"
review_status: "confirmed"
evidence_status: "verified"
keywords: ["TofFrame", "CRC16-Modbus", "重同步", "丢帧", "不重传", "异常帧"]
project_ids: ["tof"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# TofFrame 的 CRC 和重同步能恢复已经丢失的数据吗？

> [!warning] 阅读边界
> 证据：源库标为已验证（verified）；审核：源库标为已确认（confirmed）。状态沿用源库，本次导入未重新核验事实。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 不能。TofFrame 的 magic、固定帧长、版本和 CRC16-Modbus 用于发现数据损坏、帧错位与异常帧，并让接收端重新找到下一帧边界；它们不能补回已经丢失的字节或整帧。当前实时显示链路没有 ACK 和重传，允许丢弃异常帧并继续显示后续新帧。简历不写“解决数据丢包、乱序”，只写校验与异常帧重同步。

请同时查看 [[06-原始资料/阅读边界与缺失资料|版本差异说明]]，避免混用旧版与 V1 的协议、校验和架构描述。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`project.tof.boundary.001`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `kb/unified/six-project-evidence-audit.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
