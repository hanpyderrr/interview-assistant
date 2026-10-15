---
id: "embedded.Q5.7"
category: "SPI协议"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "draft"
keywords: ["TofFrame", "SPI半包", "SPI粘包", "payload magic", "version定长", "无帧尾", "CRC16", "重同步"]
project_ids: ["tof"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# TofFrame 半包、粘包和 payload 内 magic 如何重同步？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> SPI 是无消息边界字节流，接收器把每次读到的数据追加到持久缓存并逐字节搜索 TOFP。至少收到 6 字节后读取 version，由 version 决定 v1 2070 B 或 v2 4118 B；协议没有独立长度字段和帧尾。收齐候选后校验 headerSize、32×32 尺寸和 CRC16。候选失败时只前移 1 字节继续搜索，因此 payload 内偶然出现的 magic 也必须再次通过 version、结构和 CRC 才会被接受。

请同时查看 [[06-原始资料/阅读边界与缺失资料|版本差异说明]]，避免混用旧版与 V1 的协议、校验和架构描述。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q5.7`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/嵌入式Linux简历V1-三项目面试问答.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
