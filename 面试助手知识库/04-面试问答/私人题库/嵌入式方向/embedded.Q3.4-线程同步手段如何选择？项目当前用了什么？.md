---
id: "embedded.Q3.4"
category: "Linux并发"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "draft"
keywords: ["互斥锁", "条件变量", "信号量", "flock", "文件桥"]
project_ids: ["tof"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 线程同步手段如何选择？项目当前用了什么？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 互斥锁保护共享不变量，条件变量等待状态变化，信号量表示资源计数，原子变量适合简单状态。单光子项目没有共享内存同步对象：N97 写端靠同目录 tmp+rename 发布完整文件；RK 接收和 Qt 对固定 received.dat 使用 flock。rename 产生的新旧 inode 不由同一把 flock 互斥，两个阶段不能混成一种机制。

请同时查看 [[06-原始资料/阅读边界与缺失资料|版本差异说明]]，避免混用旧版与 V1 的协议、校验和架构描述。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q3.4`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/嵌入式Linux简历V1-三项目面试问答.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
