---
id: "embedded.Q17.3"
category: "构建工程"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["qmake", ".pro", "Qt", "INCLUDEPATH", "LIBS", "条件块"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# qmake 中 .pro 文件常见配置有哪些？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 常见项包括 TEMPLATE 指定工程类型、TARGET 生成目标名、QT 加号指定模块、CONFIG 配置开关、SOURCES/HEADERS/FORMS/RESOURCES 列源文件与资源、INCLUDEPATH 头文件搜索路径、DEFINES 宏定义、LIBS 链接参数，以及按平台/构建类型的条件块。LIBS 指定链接参数，INCLUDEPATH 只影响头文件搜索，二者不可混用。qmake 会生成底层 Makefile；Qt 6 主推 CMake，但维护既有 qmake 工程仍需理解 .pro/.pri。可说明如何引入模块、资源、第三方库和平台条件；不要声称已迁移 CMake，除非仓库确有实现。；条件块按平台与构建类型区分配置，FORMS 与 RESOURCES 分别管理界面文件与资源文件，实际配置以项目为准。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q17.3`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/09_构建系统与工程化.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
