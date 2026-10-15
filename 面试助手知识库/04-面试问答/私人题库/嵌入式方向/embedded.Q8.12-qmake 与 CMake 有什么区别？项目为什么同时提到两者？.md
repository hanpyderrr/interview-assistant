---
id: "embedded.Q8.12"
category: "Qt线程"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["qmake", "CMake", ".pro", "CMakeLists", "mkspec", "交叉编译"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# qmake 与 CMake 有什么区别？项目为什么同时提到两者？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> qmake 是 Qt 传统构建工具，以 .pro/.pri 描述项目；CMake 是通用构建系统，现代 Qt 已将其作为主要支持路径，target-based 依赖和跨平台生态更强。项目同时出现可能是 Qt 应用沿用 qmake，而其他 C/C++ 模块或新版本使用 CMake，也可能处于迁移阶段。二者都只是生成构建规则，不等于编译器；交叉编译时分别要正确配置 mkspec/qmake 与 CMake toolchain。不要声称“同时编译同一 target”除非代码确实如此；应查清仓库中 .pro、CMakeLists.txt 各自负责的模块和原因再回答。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q8.12`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/06_Qt显示与电机控制.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
