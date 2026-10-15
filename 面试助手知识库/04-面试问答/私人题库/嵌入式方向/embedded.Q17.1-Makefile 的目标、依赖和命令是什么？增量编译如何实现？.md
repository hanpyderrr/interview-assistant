---
id: "embedded.Q17.1"
category: "构建工程"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["Makefile", "增量编译", ".PHONY", "自动依赖", "时间戳"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# Makefile 的目标、依赖和命令是什么？增量编译如何实现？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 基本规则是 target: prerequisites，下一行 Tab 开头是生成目标的 recipe。make 比较目标与依赖的时间戳：目标不存在或任一依赖更新时执行命令，否则跳过，从而实现增量构建。头文件依赖若未声明，修改头文件可能不触发重编译，通常让编译器生成 .d 文件并 include。伪目标应声明 .PHONY；命令行本身变化默认不会被时间戳机制感知。可说明对象文件按源文件生成、自动依赖、并行构建和 clean 规则；具体变量、目录和交叉编译前缀以项目 Makefile 为准。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q17.1`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/09_构建系统与工程化.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
