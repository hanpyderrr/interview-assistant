---
id: "embedded.Q7.2"
category: "嵌入式Linux"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["output/images", "sysroot", "DTB", "根文件系统", "Bootloader", "内核镜像"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# Buildroot 生成了哪些主要产物？工具链、内核、设备树和根文件系统之间是什么关系？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 主要产物位于 output/images：Bootloader 镜像、内核镜像、DTB 和根文件系统镜像；output/host 提供主机构建工具和交叉工具链，staging/sysroot 提供目标头文件与库，target 是根文件系统的构建视图。Bootloader 初始化硬件并加载内核和 DTB；内核根据设备树发现板级硬件并挂载根文件系统；用户态应用依赖根文件系统中的动态加载器和库。具体文件名、分区和启动参数由板级配置决定，未核实的 SoC 启动细节不编造。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q7.2`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/05_网络与嵌入式Linux.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
