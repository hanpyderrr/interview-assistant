---
id: "embedded.Q17.2"
category: "构建工程"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["CMake", "交叉编译", "toolchain file", "sysroot", "PRIVATE/PUBLIC"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# CMake include/link 与 toolchain file 作用？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> target_include_directories 为目标配置头文件搜索路径；target_link_libraries 声明链接库以及目标之间的依赖关系；toolchain file 在配置阶段指定交叉编译器、目标系统、sysroot 和查找规则。PRIVATE/PUBLIC/INTERFACE 决定使用要求是否向依赖者传播。现代 CMake 优先操作 target，避免全局污染；toolchain file 应在首次 configure 时通过命令行参数指定。为板端库导出必要 include/link 使用要求，主机测试使用本机工具链；实际 CMake 版本和目录结构按仓库说明回答。；toolchain file 通常在首次 configure 时通过命令行参数指定，并在整个构建过程中保持固定，避免中途更换。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q17.2`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/09_构建系统与工程化.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
