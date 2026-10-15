---
id: "embedded.Q8.8"
category: "Qt线程"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["有界队列", "latest-frame-wins", "双缓冲", "引用计数", "update()", "丢帧"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 如何避免 UI 卡顿、队列积压、内存增长和显示旧帧？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> GUI 线程只做轻量状态交换和绘制；处理线程使用有界队列。实时预览采用 latest-frame-wins：新帧覆盖尚未显示的旧帧，绘制按屏幕节奏取最新完整帧；长任务拆分或移出 GUI 线程。必须明确缓冲生命周期，防止覆盖 GPU/消费者仍在使用的内存；可用双/三缓冲、引用计数或 fence。update() 会合并重绘请求，比在高频信号中强制同步重绘更合适。用队列上限、丢帧计数、帧龄和内存曲线验证，具体数值只报实测。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q8.8`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/06_Qt显示与电机控制.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
