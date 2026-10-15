---
id: "embedded.Q17.5"
category: "构建工程"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["Debug/Release", "NDEBUG", "未定义行为", "数据竞争", "sanitizer"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# Debug 与 Release 构建差异？优化为何暴露并发或未定义行为？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> Debug 通常低优化、带完整调试信息和断言；Release 通常开启优化、可能定义 NDEBUG、裁剪符号并改变链接方式。优化会重排或消除未受语言内存模型约束的访问，使数据竞争、越界、未初始化和生命周期错误更易显现。优化通常不是制造 bug，而是程序原有未定义行为或错误同步在不同布局、时序下暴露。volatile 不能替代原子操作和锁，也不能建立线程间 happens-before。CI 同时构建 Debug/Release，主机侧启用警告和 ASan/UBSan/TSan（适用时），嵌入式再用目标板压力与时序测试。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q17.5`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/09_构建系统与工程化.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
