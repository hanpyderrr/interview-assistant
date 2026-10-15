---
id: "embedded.Q5.1"
category: "SPI协议"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["SPI模式", "CPOL", "CPHA", "采样边沿", "spidev", "SPI_IOC_WR_MODE"]
project_ids: ["tof"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# SPI 的四种模式是什么？CPOL 和 CPHA 分别控制什么？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> SPI 模式由 CPOL 和 CPHA 的两位组合决定：Mode 0 为 0/0，Mode 1 为 0/1，Mode 2 为 1/0，Mode 3 为 1/1。CPOL 决定时钟空闲电平；CPHA 决定一个数据位在第一个还是第二个有效边沿采样。CPHA 的第一/第二边沿要结合 CPOL 理解：CPOL=0 时第一边沿是上升沿，CPOL=1 时第一边沿是下降沿。收发双方的模式、位序和数据建立/保持时间必须匹配。模式错常表现为整体位移、固定规律误码或完全无法识别帧。项目结合：实际使用 MODE0（CPOL=0、CPHA=0）、8bit、1.125MHz——哪吒 /dev/spidev1.0 作 master，ioctl SPI_IOC_WR_MODE/SPI_IOC_WR_BITS_PER_WORD/SPI_IOC_WR_MAX_SPEED_HZ 配置（需 root）；RK3568 侧 USB 转 SPI 适配器作 slave（SPI_SubMode_0、MSB）。模式与从设备手册和逻辑分析仪波形核对一致。

请同时查看 [[06-原始资料/阅读边界与缺失资料|版本差异说明]]，避免混用旧版与 V1 的协议、校验和架构描述。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q5.1`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/04_SPI协议CRC与DMA.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
