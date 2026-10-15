---
id: "embedded.Q5.16"
category: "SPI协议"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["DMA", "中断", "轮询", "缓存一致性", "coherent映射", "cache同步", "RK3568"]
project_ids: ["tof"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# DMA 与中断、轮询相比有什么优势？缓存一致性为何可能导致 DMA 数据异常？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 轮询由 CPU 反复检查状态，简单但浪费 CPU；中断在事件到来时通知 CPU，适合低到中等速率，但高频中断开销大；DMA 让外设与内存直接搬运大块数据，CPU 只负责配置和完成处理，通常能降低每字节开销并提高吞吐。缓存一致性：非硬件一致系统中，CPU cache 与内存可能内容不同。DMA 读内存前若 CPU 的脏 cache 未写回，设备会读到旧数据；DMA 写内存后若 CPU cache 未失效，CPU 会读到旧缓存；还要避免 CPU 与 DMA 同时拥有同一缓冲区。边界：Linux 驱动应使用 DMA API 建立 coherent 映射或按方向进行 map/unmap、sync；用户态通常不应自行猜测刷 cache。项目实情：本链路 RK3568 侧不走原生 SPI/DMA——数据经 USB 转 SPI 适配器的 libusb API 接收；哪吒侧 /dev/spidev1.0 由内核 spidev 驱动管理，应用层只做 ioctl SPI_IOC_MESSAGE 整帧发送。因此 DMA 缓存一致性不是本链路关键路径；实际排查重点是 USB 适配器驱动绑定（cdc_acm 抢占导致 ConfigSPIParamSlave=-3，启动前需内核 unbind）与 SPI 参数配置。

请同时查看 [[06-原始资料/阅读边界与缺失资料|版本差异说明]]，避免混用旧版与 V1 的协议、校验和架构描述。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q5.16`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/04_SPI协议CRC与DMA.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
