---
id: "embedded.tof.v1.02"
category: "单光子 TOF 成像终端 V1"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "draft"
keywords: ["getNextFrames_short", "TCSPC", "直方图", "raw reader", "5fps", "发布时间窗"]
project_ids: ["tof"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 为什么改用 `getNextFrames_short()`？如何得到直方图？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 旧的 `getHistogram_short()` 会直接返回 32×32×1024 直方图，但实机上出现约 800 ms 的成簇输出，难以稳定控制发布节奏。探针测试确认 `getNextFrames_short()` 可以毫秒级连续读取每个像素的原始 TDC code，因此增加 raw reader：每次读取若干 raw frame，将每个像素的 TDC code 累加到 32×32×1024 的 `uint16_t` 直方图，达到发布时间窗后做峰值检测并清空直方图进入下一窗。当前生效配置为 raw 模式、每次读 16 帧，发布目标约 5 fps；实机发布间隔约 203—208 ms，对应约 4.81—4.93 fps。
> 
> 数据量要能现场计算：原始直方图为 `32×32×1024×2=2,097,152 B`（2 MiB）；深度数组和强度数组各为 2048 B；TofFrame v1/v2 分别为 2070 B/4118 B。按 1.125 MHz 纯线速估算，v1/v2 至少约 14.72 ms/29.28 ms，而 2 MiB 原始直方图至少约 14.91 s，所以原始 TCSPC 只在 N97 处理与存档，跨机实时链路只发送深度/强度结果。

请同时查看 [[06-原始资料/阅读边界与缺失资料|版本差异说明]]，避免混用旧版与 V1 的协议、校验和架构描述。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.tof.v1.02`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/嵌入式Linux简历V1-三项目面试问答.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
