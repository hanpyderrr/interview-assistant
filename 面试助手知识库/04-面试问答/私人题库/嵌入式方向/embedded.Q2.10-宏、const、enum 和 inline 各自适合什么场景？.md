---
id: "embedded.Q2.10"
category: "C/C++基础"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["宏", "constexpr", "enum class", "inline", "ODR", "条件编译"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 宏、const、enum 和 inline 各自适合什么场景？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 宏适合条件编译、平台适配或必须在预处理期完成的代码；类型化常量优先用 constexpr/const；有限的命名取值优先用 enum class；短函数和头文件中需要允许多重定义的函数可用 inline。宏没有作用域和类型检查，函数式宏还可能重复求值；enum class 不会隐式污染外层作用域，转换也更严格。inline 的核心是放宽 ODR，使定义可出现在多个翻译单元，并不保证编译器一定内联，是否展开由优化器决定。项目结合：协议状态、错误码和 SPI 模式可用强类型枚举；长度上限、魔数可用 constexpr；平台差异再用少量条件编译宏。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q2.10`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/02_C与C++基础.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
