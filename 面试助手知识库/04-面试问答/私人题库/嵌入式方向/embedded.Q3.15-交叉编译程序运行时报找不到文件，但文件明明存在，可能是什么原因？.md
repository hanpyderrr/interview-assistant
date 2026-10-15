---
id: "embedded.Q3.15"
category: "Linux并发"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["交叉编译", "ELF解释器", "readelf", "INTERP", "RPATH", "CRLF", "Buildroot"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 交叉编译程序运行时报找不到文件，但文件明明存在，可能是什么原因？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 最常见的是 ELF 解释器不存在或架构不匹配，而不是可执行文件本身不存在：例如 AArch64 程序请求的动态加载器路径在根文件系统缺失，shell 会报告类似 not found。也可能是脚本 shebang 指向不存在的解释器、CRLF 污染解释器路径、依赖库缺失或目标无执行权限。排查：用 file 看架构和静/动态链接，readelf -l 看 INTERP，readelf -d 看依赖和 RPATH/RUNPATH，在目标机检查加载器与库；脚本用十六进制或 sed -n l 查看 CRLF，再检查挂载是否 noexec。项目结合：Buildroot 的工具链、sysroot 和板端根文件系统必须来自兼容配置，不能只把宿主机库复制到目标机。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q3.15`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/03_Linux并发与IPC.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
