---
id: "embedded.tof.v1.05"
category: "单光子 TOF 成像终端 V1"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "draft"
keywords: ["SPI", "spidev", "SPI_IOC_MESSAGE", "MODE0", "1.125MHz", "重同步"]
project_ids: ["tof"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# SPI 两侧如何实现？为什么接收端需要重同步？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> N97 使用原生 SPI 控制器作为 SPI master：通过 `spidev` 和 `ioctl` 配置 MODE0、8 bit、1.125 MHz，再用 `SPI_IOC_MESSAGE` 发送整帧。USB-SPI 适配器的 SPI 引脚侧配置为 SPI slave，USB 端接入 RK3568，RK3568 通过厂商库读取适配器收到的字节流。SPI 字节流本身没有消息边界，接收可能从任意字节位置开始，所以接收端在缓存中搜索 `TOFP` magic，再根据 version 确定 2070 B 或 4118 B 帧长，收齐后检查尺寸、有效点数和 CRC16；校验失败就从下一个 magic 候选位置继续搜索。实时显示允许丢一帧，因此不做 ACK 和重传。

请同时查看 [[06-原始资料/阅读边界与缺失资料|版本差异说明]]，避免混用旧版与 V1 的协议、校验和架构描述。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.tof.v1.05`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/嵌入式Linux简历V1-三项目面试问答.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
