---
id: "embedded.Q8.6"
category: "Qt线程"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "draft"
keywords: ["Qt显示链路", "PF32", "直方图", "SPI", "文件桥", "MIPI"]
project_ids: ["tof"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 深度数据从采集到 Qt 显示经过哪些阶段？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> PF32 经 USB 到 N97，raw reader 累积 32×32×1024 直方图并生成深度/强度；采集进程发布 /tmp/depth.dat，spi_syncer 校验后通过 SPI 发送；RK3568 接收端按 magic 与版本重同步、验 CRC 后覆写 /tmp/received.dat；Qt 以共享文件锁读取新 seq，完成显示映射并送 MIPI 屏。

请同时查看 [[06-原始资料/阅读边界与缺失资料|版本差异说明]]，避免混用旧版与 V1 的协议、校验和架构描述。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q8.6`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/嵌入式Linux简历V1-三项目面试问答.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
