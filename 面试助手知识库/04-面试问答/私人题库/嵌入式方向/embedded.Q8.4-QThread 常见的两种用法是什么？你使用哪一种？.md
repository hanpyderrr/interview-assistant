---
id: "embedded.Q8.4"
category: "Qt线程"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["QThread", "worker-object", "run()", "事件循环", "线程归属"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# QThread 常见的两种用法是什么？你使用哪一种？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 一是 worker-object 模式：业务 QObject 移入 QThread，利用事件循环和信号槽；二是继承 QThread 并重写 run()，适合封装明确的阻塞循环或无需事件循环的一次任务。通常优先 worker-object，因为业务与线程生命周期分离更清晰。QThread 对象本身属于创建它的线程，重写类中的普通槽不会自动在新线程执行；只有 run() 内代码运行于新线程。是否选择继承应看任务模型，不是绝对禁用。必须按代码真实回答使用哪种，并解释对象归属、事件循环和退出流程。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q8.4`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/06_Qt显示与电机控制.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
