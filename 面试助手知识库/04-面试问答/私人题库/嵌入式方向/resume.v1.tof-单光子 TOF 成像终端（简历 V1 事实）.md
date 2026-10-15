---
id: "resume.v1.tof"
category: "简历 V1 项目事实"
fact_status: "resume_fact"
review_status: "codex_draft"
evidence_status: "draft"
keywords: ["单光子", "TOF", "双机架构", "Intel N97", "RK3568", "PF32", "x86_64", "文件桥", "tmp+rename", "flock", "seq去重", "半帧", "IPC"]
project_ids: ["tof"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 单光子 TOF 成像终端（简历 V1 事实）

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 单光子 TOF 成像终端由 Intel N97 与 RK3568 组成。N97 通过仅支持 x86_64 Linux 的 PF32 SDK 完成采集、TCSPC 处理和本地存档，并作为 SPI master 发送深度帧；RK3568 经配置为 SPI slave 的 USB-SPI 适配器接收，负责 Qt/MIPI 显示和串口外设。N97 的 depth.dat 采用 tmp+rename 原子发布；RK3568 的 received.dat 采用同一 inode 上的 flock 读写协调，并以 CRC16 和 seq 校验。电机仅确认方向控制和手动粗调、细调，未找到独立停止命令，也未完成自动调焦。

请同时查看 [[06-原始资料/阅读边界与缺失资料|版本差异说明]]，避免混用旧版与 V1 的协议、校验和架构描述。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`resume.v1.tof`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/韩忠毅-太原理工-嵌入式Linux应用开发-2026-08-16-1版.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
