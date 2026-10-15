---
id: "embedded.Q21.7"
category: "压力追问"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["TRIG", "PF32", "Si5351A", "外触发", "固件", "故障复盘"]
project_ids: ["tof"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# DMA 异常的现象、排查日志/波形、根因和修复结果

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 复盘素材用 PF32 TRIG 无输出案例（真实闭环）：现象——激光切外触发不出光、无法成像；假设——sys_master 的 TRIG 输出缺失或 FPGA 固件不支持 TDC；证据——示波器探 TRIG SMA 无信号，Python 直调 SDK 1.5.21/1.5.25 两版本，link_status=2、配置读回正确、直方图 counts≈2500/帧但 peak_bin 全 0、sync=0Hz；排除——两版 SDK 复现、USB 链路正常；根因——PF32_USB3.bit 为光子计数流固件、无 TRIG 输出电路，setMode 被接受但无硬件效果；方案——Si5351A 双路同源外触发（CLK0→激光 P3，CLK1→PF32 SYNC，500kHz），PF32 改跑 TCSPC_laser_master；复测——I²C 初始化与两路输出验证通过。教训：API 返回成功不等于硬件功能存在。 证据边界：本条复测仅确认Si5351A的I²C初始化与双路时钟输出，未给出此次改造后整机重新出光成像的验收结果，也未给出双路相位差、抖动等同步精度测量；不能把方案配置或输出测试扩写为这些结果已全部验证。

请同时查看 [[06-原始资料/阅读边界与缺失资料|版本差异说明]]，避免混用旧版与 V1 的协议、校验和架构描述。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q21.7`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/单光子项目-实情口径面试问答.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
