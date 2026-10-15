---
id: "prepared.001"
category: "Linux并发/IPC"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "draft"
keywords: ["多进程", "IPC口述", "文件桥", "POSIX共享内存", "真实项目"]
project_ids: ["tof"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 单光子项目多进程与 IPC 的口述回答

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 先说明采集、SPI 和显示的阻塞点与重启边界不同，因此拆进程；再说明当前深度帧只有 2—4 KB、约 5 fps，实际使用 /tmp 文件桥：N97 用 tmp+rename，RK 的固定 received.dat 用 flock，CRC 与 seq 负责校验和去重。POSIX 共享内存是曾考虑的升级方向，源码未落地。

请同时查看 [[06-原始资料/阅读边界与缺失资料|版本差异说明]]，避免混用旧版与 V1 的协议、校验和架构描述。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`prepared.001`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/嵌入式Linux简历V1-三项目面试问答.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
