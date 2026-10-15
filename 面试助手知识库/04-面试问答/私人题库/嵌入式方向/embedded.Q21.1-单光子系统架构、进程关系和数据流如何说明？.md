---
id: "embedded.Q21.1"
category: "压力追问"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "draft"
keywords: ["架构图", "进程关系", "数据流", "TofFrame", "文件桥", "部署"]
project_ids: ["tof"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 单光子系统架构、进程关系和数据流如何说明？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 架构按 PF32→N97→SPI→RK3568→MIPI/串口外设画；N97 标出采集与 spi_syncer，RK 标出 spi_receiver 与 Qt。进程间均标注 /tmp 文件桥，跨机标注 TofFrame v1/v2、magic、seq、CRC16；部署侧标 systemd 与 BusyBox init.d。不要在图上加入当前未完成的共享内存、自动调焦或公网链路。

请同时查看 [[06-原始资料/阅读边界与缺失资料|版本差异说明]]，避免混用旧版与 V1 的协议、校验和架构描述。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q21.1`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/嵌入式Linux简历V1-三项目面试问答.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
