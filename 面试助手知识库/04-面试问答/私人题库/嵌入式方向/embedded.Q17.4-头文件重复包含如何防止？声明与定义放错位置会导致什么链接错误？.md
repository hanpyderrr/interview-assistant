---
id: "embedded.Q17.4"
category: "构建工程"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["include guard", "#pragma once", "ODR", "multiple definition", "undefined reference"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 头文件重复包含如何防止？声明与定义放错位置会导致什么链接错误？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 使用 include guard 或 #pragma once 防止同一翻译单元重复展开。普通非 inline 函数或具有外部链接的变量若在头文件定义，会在多个翻译单元产生 multiple definition；只声明却没有任何定义会产生 undefined reference。include guard 解决重复包含，不自动解决跨翻译单元 ODR；模板、类内定义、inline 函数通常需在头文件可见；C++17 inline 变量可合法放头文件；static 虽避免链接冲突，却会为每个翻译单元生成副本。头文件放接口声明，.c/.cpp 放单一定义；全局变量用 extern 声明并在一个源文件定义，同时注意 extern "C"。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q17.4`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/09_构建系统与工程化.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
