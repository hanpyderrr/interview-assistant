---
id: "embedded.Q5.2"
category: "SPI协议"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["全双工", "MOSI", "MISO", "SCLK", "片选", "dummy字节"]
project_ids: ["tof"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# SPI 是全双工还是半双工？片选、时钟和数据线分别由谁控制？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 标准四线 SPI 具备全双工能力：主机每输出一个时钟，MOSI 与 MISO 可同时移出/采入一位；也存在三线半双工或器件只使用单向数据的变体。主机通常产生 SCLK 并控制 CS；MOSI 由主机驱动，MISO 由被选中的从机驱动。SPI 没有统一高层协议，CS 的有效极性、帧间保持、命令/地址/数据阶段、最大频率都由器件定义。全双工能力不表示每个器件协议都同时承载双向有效数据；读操作时主机仍需发送 dummy 字节产生时钟。项目追问：实际是标准四线 SPI（SCLK/MOSI/MISO/CS）：哪吒原生 SPI 引脚作 master（MODE0、1.125MHz），CS 由 master 控制；从机不是 RK3568 原生 SPI，而是插在 RK3568 USB 口的 USB 转 SPI 适配器模块（USB ID 0483:5740），以 libUSB2UARTSPIIIC 配置为 SPI slave（SPI_SubMode_0、MSB）。选 USB 适配器的原因：RK3568 唯一启用的原生 SPI（spi@fe620000）设备树被板内 STM32 占用。整帧单次 SPI_IOC_MESSAGE 发送，一次传输要求 CS 全程保持。

请同时查看 [[06-原始资料/阅读边界与缺失资料|版本差异说明]]，避免混用旧版与 V1 的协议、校验和架构描述。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q5.2`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/04_SPI协议CRC与DMA.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
