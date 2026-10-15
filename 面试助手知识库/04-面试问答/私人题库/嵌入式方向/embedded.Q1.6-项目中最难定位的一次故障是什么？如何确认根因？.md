---
id: "embedded.Q1.6"
category: "个人定位"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["故障定位", "根因分析", "CRC错误", "DMA", "逻辑分析仪", "SPI时序", "回归验证"]
project_ids: ["tof"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 项目中最难定位的一次故障是什么？如何确认根因？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 回答方法：使用现象、假设、证据、排除、根因、方案、复测的链条，不要只说通过示波器发现时序问题。真实案例（PF32 TRIG 无输出）：现象是激光设为外触发后不亮、系统无法出光成像。假设：PF32 的 sys_master 模式 TRIG 输出缺失，或 FPGA 固件不支持 TDC 时序输出。证据：示波器探 PF32 TRIG SMA 口无信号；Python 直调 SDK C API（1.5.21/1.5.25 两版本），link_status=2 后 setMode(TCSPC_sys_master)+setEXTSTOPEnable(true)，extstop 读回 True、getHistogram_short ok=True 且 counts≈2500/帧（正常暗计数），但 peak_bin 全为 0、sync=0Hz。排除：SDK 调用路径与 USB 链路正常，两个 SDK 版本均复现，排除软件调用与接线问题。根因：PF32_USB3.bit 是光子计数流固件，不实现 TDC 时间测量，FPGA 无 TRIG 输出电路，setMode(sys_master) 被 SDK 接受但无硬件效果。方案：改用 Si5351A 时钟芯片双路同源外触发——CLK0 驱动激光 P3 外触发、CLK1 驱动 PF32 SYNC SMA（+3.3V、50Ω、500kHz），PF32 跑 TCSPC_laser_master，以 SYNC 作 TDC 时序参考。复测：Si5351A I²C 初始化（哪吒 HAT SDA/SCL）与两路 500kHz 输出验证通过。此案例与旧简历中'定位 DMA 通信异常'的表述不一致，面试前必须统一口径（以真实经历为准，或同步修改简历）。 证据边界：本条复测仅确认Si5351A的I²C初始化与双路时钟输出，未给出此次改造后整机重新出光成像的验收结果，也未给出双路相位差、抖动等同步精度测量；不能把方案配置或输出测试扩写为这些结果已全部验证。

请同时查看 [[06-原始资料/阅读边界与缺失资料|版本差异说明]]，避免混用旧版与 V1 的协议、校验和架构描述。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q1.6`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/01_个人定位与行为面试.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
