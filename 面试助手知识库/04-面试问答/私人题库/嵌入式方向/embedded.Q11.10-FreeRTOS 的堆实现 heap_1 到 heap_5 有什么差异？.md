---
id: "embedded.Q11.10"
category: "FreeRTOS"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["heap_1~heap_5", "内存碎片", "静态分配", "堆监控", "不连续内存"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# FreeRTOS 的堆实现 heap_1 到 heap_5 有什么差异？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> heap_1 只分配不释放；heap_2 可释放但不合并相邻空闲块；heap_3 封装标准 malloc/free；heap_4 可释放并合并相邻空闲块；heap_5 算法类似 heap_4，但支持多个不连续内存区。动态分配可能失败或碎片化，实时性也更难界定；heap_3 的线程安全和锁取决于 C 库及端口；heap_5 使用前要先定义内存区域。资源固定的 MCU 项目优先静态创建任务/队列；若确需动态对象，启动阶段集中分配并监控最小剩余堆。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q11.10`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/07_FreeRTOS与现场总线.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
