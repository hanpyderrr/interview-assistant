---
id: "embedded.tof.v1.04"
category: "单光子 TOF 成像终端 V1"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "draft"
keywords: ["TofFrame", "v1", "v2", "CRC16-Modbus", "magic", "seq", "帧协议"]
project_ids: ["tof"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# TofFrame 为什么要有两个版本？帧格式是什么？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> TofFrame 按线序分成帧头、载荷、CRC 三段：v1 = 20 B 帧头 + 2048 B 深度载荷 + 2 B CRC，共 2070 B；v2 = 20 B 帧头 + 2048 B 深度载荷 + 2048 B 强度载荷 + 2 B CRC，共 4118 B。两个版本的 CRC16-Modbus 都在整帧最后两个字节，不属于公共帧头。公共帧头字段是 magic TOFP、version、headerSize、flags、seq、width、height、validCount、reserved。headerSize 字段值是16，但 payload 实际从 byte20 开始，不能把字段值当作载荷偏移。v1 CRC 字段在 bytes[2068..2069]，覆盖 bytes[4..2067]；v2 CRC 字段在 bytes[4116..4117]，覆盖 bytes[4..4115]，均使用初值0xFFFF、多项式0xA001。长度由version决定，无独立长度字段，也没有额外的帧结束标志；不能将“无帧结束标志”说成“末尾没有CRC”。

请同时查看 [[06-原始资料/阅读边界与缺失资料|版本差异说明]]，避免混用旧版与 V1 的协议、校验和架构描述。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.tof.v1.04`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/嵌入式Linux简历V1-三项目面试问答.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
