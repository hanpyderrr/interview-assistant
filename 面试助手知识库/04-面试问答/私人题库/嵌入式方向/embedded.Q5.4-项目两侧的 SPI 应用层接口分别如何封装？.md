---
id: "embedded.Q5.4"
category: "SPI协议"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["spidev封装", "read", "ioctl", "SPI_IOC_MESSAGE", "短读", "EINTR", "错误码"]
project_ids: ["tof"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 项目两侧的 SPI 应用层接口分别如何封装？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 项目的 SPI 两侧封装不同。哪吒侧 spi_syncer 通过 open 打开 /dev/spidev1.0，用 ioctl 配置 MODE0、8 bit、1.125 MHz，发送用 SPI_IOC_MESSAGE 提交 spi_ioc_transfer；这一侧的 read 是读取 /tmp/depth.dat 文件，不是从 SPI 字符设备接收数据。RK3568 侧 spi_receiver 使用 USB-SPI 适配器 API，通过 OpenUsb、ConfigSPIParamSlave 和 SPISlaveRcvData 接收字节流，再交给状态机完成 magic 同步、定长收帧和 CRC16-Modbus 校验。因此简历应写‘哪吒 spidev ioctl 发送 + RK3568 USB-SPI 适配器 API 接收’，不统称为 SPI read/ioctl 接收封装。

请同时查看 [[06-原始资料/阅读边界与缺失资料|版本差异说明]]，避免混用旧版与 V1 的协议、校验和架构描述。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q5.4`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/04_SPI协议CRC与DMA.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
