---
id: "embedded.Q7.1"
category: "嵌入式Linux"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["Buildroot", "Yocto", "OpenEmbedded", "交叉工具链", "根文件系统", "layer", "recipe"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# Buildroot 的作用是什么？它与 Yocto 有什么区别？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> Buildroot 用配置和构建规则生成交叉工具链、Bootloader、内核和根文件系统，强调简单、整体镜像和较短学习曲线；Yocto/OpenEmbedded 通过 layer、recipe 和包元数据构建发行版，定制、复用、包管理和许可证追踪能力更强，但复杂度与构建成本更高。Buildroot 通常不把目标机在线包升级作为核心模式，常采用整镜像重建和升级；两者都能做可复现构建，区别是工程模型和规模适配。应说明项目为何选 Buildroot，不泛称 Yocto 一定更慢或 Buildroot 不能做包。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q7.1`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/05_网络与嵌入式Linux.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
