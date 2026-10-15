---
id: "embedded.Q7.4"
category: "嵌入式Linux"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["BR2_EXTERNAL", "Config.in", ".mk", "交叉编译", "RPATH", "CMake"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 如何在 Buildroot 中加入自己的应用和第三方库？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 推荐建立外部树 BR2_EXTERNAL，为应用创建 Config.in 和 .mk/基础设施描述，声明源码、版本、依赖、构建及安装到 target 的步骤，再由 defconfig 选中；简单配置文件可通过 rootfs overlay 安装，但应用及依赖应纳入构建图。构建时使用 $(TARGET_MAKE_ENV)、$(TARGET_CONFIGURE_OPTS) 或 CMake package infrastructure，避免误用宿主编译器；第三方许可证、hash、运行时库和 RPATH 也要检查。若项目采用项目内 package 或 overlay，应如实展示对应目录，不把手动 SCP 当成可复现集成。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q7.4`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/05_网络与嵌入式Linux.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
