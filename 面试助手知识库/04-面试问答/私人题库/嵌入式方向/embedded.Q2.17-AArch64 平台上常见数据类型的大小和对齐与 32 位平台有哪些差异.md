---
id: "embedded.Q2.17"
category: "C/C++基础"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["AArch64", "LP64", "ILP32", "size_t", "固定宽度类型", "ABI", "RK3568"]
project_ids: ["tof"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# AArch64 平台上常见数据类型的大小和对齐与 32 位平台有哪些差异？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> AArch64 Linux 通常采用 LP64：char 1 字节、short 2、int 4、long 和指针 8、long long 8；常见 32 位 Linux 采用 ILP32：int、long、指针通常都是 4。size_t、ptrdiff_t 随指针宽度变化，包含指针或 long 的结构体大小和对齐通常也会改变。这些是常见 ABI，不应把标准未保证的大小写死，以目标工具链的 sizeof、alignof 和 ABI 文档为准；long double、向量类型及最大对齐还可能因 ABI 不同。跨平台协议和磁盘格式应使用 std::uint32_t 等固定宽度类型和显式序列化，指针绝不能写入跨进程重映射后当作有效地址。RK3568 是 AArch64 平台，共享内存结构布局应加版本、固定宽度字段和静态断言，不能直接复用 32 位侧的默认布局。

请同时查看 [[06-原始资料/阅读边界与缺失资料|版本差异说明]]，避免混用旧版与 V1 的协议、校验和架构描述。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q2.17`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/02_C与C++基础.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
