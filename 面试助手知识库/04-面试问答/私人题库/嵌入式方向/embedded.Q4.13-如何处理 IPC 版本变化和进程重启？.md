---
id: "embedded.Q4.13"
category: "LinuxIPC"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "draft"
keywords: ["TofFrame", "v1", "v2", "CRC16-Modbus", "magic", "seq", "帧协议", "进程重启", "版本兼容"]
project_ids: ["tof"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 如何处理 IPC 版本变化和进程重启？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 当前版本兼容重点在 TofFrame：头部带 magic、version、header size、尺寸和 seq，接收端按 v1 2070 B 或 v2 4118 B 解释，未知版本拒绝。v1和v2的CRC16-Modbus都放在整帧最后2字节，不在帧头内；CRC不通过重新搜magic。进程重启后不信任 /tmp 旧文件，仍做完整校验和 seq 判断。共享内存布局版本只是未来升级时需要另行设计。

请同时查看 [[06-原始资料/阅读边界与缺失资料|版本差异说明]]，避免混用旧版与 V1 的协议、校验和架构描述。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q4.13`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/嵌入式Linux简历V1-三项目面试问答.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
