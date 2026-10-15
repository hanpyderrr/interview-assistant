---
id: "embedded.Q20.4"
category: "压力追问"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "draft"
keywords: ["文件桥", "共享内存", "信号量", "IPC取舍", "TofFrame"]
project_ids: ["tof"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 当前为什么用文件桥而不是共享内存与信号量？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 当前帧为 2070 B 或 4118 B、约 5 fps，文件桥满足节奏要求。N97 以 tmp+rename 原子发布，RK 对固定 received.dat 使用 flock，CRC 和 seq 做校验与去重；两套机制分处不同阶段。共享内存与信号量会增加槽位、初始化、崩溃恢复和残留对象处理，现阶段没有基准证据证明值得切换。

请同时查看 [[06-原始资料/阅读边界与缺失资料|版本差异说明]]，避免混用旧版与 V1 的协议、校验和架构描述。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q20.4`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/嵌入式Linux简历V1-三项目面试问答.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
