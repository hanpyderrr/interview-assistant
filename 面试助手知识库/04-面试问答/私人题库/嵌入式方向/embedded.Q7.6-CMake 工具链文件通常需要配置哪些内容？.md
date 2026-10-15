---
id: "embedded.Q7.6"
category: "嵌入式Linux"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["CMake", "toolchain", "CMAKE_SYSTEM_NAME", "sysroot", "find_package", "pkg-config"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# CMake 工具链文件通常需要配置哪些内容？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 通常设置 CMAKE_SYSTEM_NAME、CMAKE_SYSTEM_PROCESSOR、C/C++ 编译器、sysroot、查找根路径及 CMAKE_FIND_ROOT_PATH_MODE_*；必要时配置目标编译/链接选项、pkg-config 环境和无法在宿主运行测试程序时的策略。工具链文件负责描述目标平台，不应把每个业务 target 的依赖硬编码进去；关键是让 find_library/find_package 找目标库、让构建工具找宿主程序，防止 host/target 混用。可用 CMakeCache.txt、verbose link command 和 file/readelf 验证实际编译器、ABI 与链接结果。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q7.6`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/05_网络与嵌入式Linux.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
