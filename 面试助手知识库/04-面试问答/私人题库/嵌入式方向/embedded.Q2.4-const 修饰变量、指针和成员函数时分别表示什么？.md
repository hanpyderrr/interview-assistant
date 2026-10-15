---
id: "embedded.Q2.4"
category: "C/C++基础"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["const", "指针限定", "const成员函数", "mutable", "std::span", "接口契约"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# const 修饰变量、指针和成员函数时分别表示什么？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> const T x 表示不能通过该名字修改 x；const T* p 是指向常量的指针，不能经 p 修改对象；T* const p 是常指针，指向不能改变；const T* const p 两者都限制。成员函数末尾的 const 表示不修改对象的可观察状态，可在 const 对象上调用，且不能调用非 const 成员函数。const 是接口契约和编译期约束，不等同于线程安全；mutable 成员可在 const 成员函数中修改。底层对象本来不是常量时可谨慎去掉 const，但修改一个实际定义为 const 的对象仍是未定义行为。项目结合：协议解析接口可用 std::span<const std::byte> 或 const 指针加长度的形式表达只读输入，减少误写原始帧的风险。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q2.4`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/02_C与C++基础.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
