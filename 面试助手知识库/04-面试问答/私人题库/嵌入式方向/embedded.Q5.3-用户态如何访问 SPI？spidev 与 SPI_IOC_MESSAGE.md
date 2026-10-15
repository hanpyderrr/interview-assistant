---
id: "embedded.Q5.3"
category: "SPI协议"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["spidev", "/dev/spidevB.C", "SPI_IOC_MESSAGE", "spi_ioc_transfer", "ioctl"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 用户态如何访问 SPI？spidev 与 SPI_IOC_MESSAGE 有何区别

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> spidev 是 Linux SPI 用户态通用字符设备接口，应用打开 /dev/spidevB.C，再用 ioctl 配置 mode、bits per word、max speed 等。read 或 write 适合单向、较简单的传输；SPI 时钟仍意味着底层同时收发，但未用方向的数据被丢弃或填充。SPI_IOC_MESSAGE(N) 可提交一个或多个 spi_ioc_transfer，为每段指定 tx/rx 缓冲、长度、速率、字宽、延时和是否切换 CS。边界：spidev 适合用户态控制的简单设备，不替代需要中断、DMA 管理、电源管理或内核子系统集成的专用驱动；单次 ioctl 是否保 CS、长度上限和 DMA 路径取决于控制器驱动。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q5.3`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/04_SPI协议CRC与DMA.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
