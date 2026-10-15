---
id: "embedded.Q4.10"
category: "LinuxIPC"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "draft"
keywords: ["tmp+rename", "flock", "inode", "open", "fsync", "文件桥", "调用顺序"]
project_ids: ["tof"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# tmp+rename 与 flock 的真实调用顺序和 inode 边界是什么？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> N97 侧打开 depth.dat.tmp，写完整帧后 close，再 rename 到 depth.dat；源码没有 flock 或 fsync，这一段依赖同目录 rename 的原子路径替换。RK 接收端打开固定 received.dat，LOCK_EX 后 ftruncate、lseek、write、fsync、解锁并 close；Qt 打开同一路径，LOCK_SH 后 fstat/read，再解锁 close。flock 关联已打开的文件对象/inode；读者持有旧 inode 时，写者把新 inode rename 到同一路径，两者不会因路径名相同而自动互斥。 通用机制说明（不代表项目已经改造）：互斥和完整帧发布要分别判断。flock 不能跨被 rename 替换的两个文件对象互斥；但若临时文件已完整写好、检查写入成功、关闭后在同一文件系统 rename 发布，且发布后不再修改该文件，读者看到的是完整旧版本或完整新版本，不会仅因锁未互斥就必然读到半帧。一直持有旧 fd 会继续读旧版本；需要新版本时重新打开路径，并检查帧长与序号。若直接截断覆写正在读的同一文件，则需要有效的读写协调。rename 的路径原子替换不等于掉电持久性保证，不能笼统回答整体必然安全或不安全。

请同时查看 [[06-原始资料/阅读边界与缺失资料|版本差异说明]]，避免混用旧版与 V1 的协议、校验和架构描述。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q4.10`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/嵌入式Linux简历V1-三项目面试问答.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
