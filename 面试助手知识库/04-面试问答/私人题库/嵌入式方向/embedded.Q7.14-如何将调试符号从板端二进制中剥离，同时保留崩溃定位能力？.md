---
id: "embedded.Q7.14"
category: "嵌入式Linux"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["objcopy", "strip", "debuglink", "Build ID", "addr2line", "崩溃定位"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 如何将调试符号从板端二进制中剥离，同时保留崩溃定位能力？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 构建带 -g 的未剥离 ELF，使用 objcopy --only-keep-debug 保存独立 debug 文件，再对部署文件 strip，并可用 --add-gnu-debuglink 关联；服务器按 Build ID/版本保存原 ELF、debug 文件、map 和源码提交，板端只部署剥离产物。崩溃地址必须与完全相同的构建匹配；ASLR/PIE 需先用模块加载基址还原相对地址；优化、内联会影响源码行映射；core dump 还需匹配库和加载地址。若项目只保留未剥离副本，应如实说明，可演示 readelf、addr2line 或 gdb 定位流程。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q7.14`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/05_网络与嵌入式Linux.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
