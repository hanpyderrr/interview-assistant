---
id: "prepared.002"
category: "SPI/调试"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["半帧", "排查链", "逻辑分析仪", "TRIG"]
project_ids: ["tof"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# SPI异常排查口述框架

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> SPI 偶发半帧排查：按接收长度与状态机日志→CRC 结果→逻辑分析仪波形（CS/SCLK/MOSI/MISO）→UART 日志→dmesg 逐层缩小范围；若半帧问题无最终实验记录，回答中明说当时缓解手段而不编造根因。真实闭环的最难故障案例用 PF32 TRIG 无输出（见 kb Q1.6），与简历“DMA 通信异常”旧措辞统一口径后再面试。

请同时查看 [[06-原始资料/阅读边界与缺失资料|版本差异说明]]，避免混用旧版与 V1 的协议、校验和架构描述。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`prepared.002`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/单光子项目-实情口径面试问答.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
