---
id: "embedded.Q5.5"
category: "SPI协议"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["数据帧格式", "帧头", "长度字段", "CRC32", "帧尾", "状态机", "十六进制样例"]
project_ids: ["tof"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 你的光子数据帧格式是什么？帧头、长度、有效载荷、校验和帧尾如何定义？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 深度帧是定长 TofFrame，小端，两版并存：v1 共 2070B——[0..3] magic 0x50464F54（TOFP）、[4] version=1、[5] headerSize=16、[6..7] flags=0、[8..11] seq 帧序号、[12..13] width=32、[14..15] height=32、[16..17] validCount 有效像素数、[18..19] reserved、[20..2067] depths 1024×uint16 毫米深度（0=无效）、[2068..2069] crc16（CRC16-Modbus，初值 0xFFFF、多项式 0xA001，覆盖 bytes[4..2067]）。v2 共 4118B，在前者基础上 [2068..4115] 增加 intensities 1024×uint16 峰值计数，CRC 覆盖 bytes[4..4115]。帧头是 magic+version 定长 20B，无独立长度字段（长度由 version 决定）、无帧尾。面试时按线序画出字段并给一帧真实十六进制样例（开头 54 4F 46 50 即 TOFP），说明 SPI 是无边界字节流、接收端在流中按 magic 搜索同步、按 version 定长收齐后校验 CRC16-Modbus；校验失败丢帧计数、不重传（丢帧只丢一画面）。5G 文件队列阶段的信封协议（MAGIC 0xABCD + CMD + SEQ + LEN + CRC32）属暂缓阶段预留，实时流不用。

请同时查看 [[06-原始资料/阅读边界与缺失资料|版本差异说明]]，避免混用旧版与 V1 的协议、校验和架构描述。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q5.5`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/04_SPI协议CRC与DMA.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
