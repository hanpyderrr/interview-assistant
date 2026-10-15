---
id: "embedded.Q7.10"
category: "嵌入式Linux"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["内核驱动", "设备模型", "sysfs", "ioctl", "spidev", "用户态封装"]
project_ids: ["tof"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 应用层设备接口封装和真正的 Linux 内核驱动有什么区别？项目实际使用哪一层？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 内核驱动负责硬件资源、总线框架、中断/DMA、电源管理和设备模型，并向用户态暴露标准接口；应用层封装是在既有 /dev、sysfs、ioctl 或厂商库接口之上组织初始化、读写、协议和错误处理，用户态代码不是内核驱动。项目中哪吒侧通过 /dev/spidev1.0 和 ioctl SPI_IOC_MESSAGE 发送，RK3568 侧通过 USB 转 SPI 适配器的 libusb 厂商 API 接收，因此应准确表述为用户态设备访问与接口封装；除非有真实提交或配置证据，不表述为独立开发 Linux 内核驱动。

请同时查看 [[06-原始资料/阅读边界与缺失资料|版本差异说明]]，避免混用旧版与 V1 的协议、校验和架构描述。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q7.10`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/05_网络与嵌入式Linux.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
