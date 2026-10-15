---
id: "embedded.oral.03"
category: "个人定位口语答案"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "draft"
keywords: ["单光子", "TOF", "双机架构", "Intel N97", "RK3568", "PF32", "x86_64", "一分钟项目介绍"]
project_ids: ["tof"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 请用 1 分钟介绍单光子 TOF 项目

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 系统最早在 Intel N97 NUC 上做单机验证。PF32 探测器的厂商 SDK 和驱动只支持 x86_64 Linux，无法直接放到 ARM64 的 RK3568 上；后来又需要接 MIPI 屏、串口电机等板级外设，所以演进为双机。PF32 经 USB 接入 N97，N97 负责 SDK 采集、TCSPC 处理、深度计算和本地存档；处理后的 32×32 深度帧经 SPI 发给 RK3568，RK3568 完成帧校验、MIPI 屏显示和外设接入。原始 TCSPC 数据不跨 SPI，只保存在 N97。两机各自用服务脚本启动：N97 用 systemd，RK3568 用 BusyBox `init.d`。

请同时查看 [[06-原始资料/阅读边界与缺失资料|版本差异说明]]，避免混用旧版与 V1 的协议、校验和架构描述。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.oral.03`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/嵌入式Linux简历V1-三项目面试问答.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
