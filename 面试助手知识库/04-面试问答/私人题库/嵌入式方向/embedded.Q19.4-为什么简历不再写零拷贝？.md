---
id: "embedded.Q19.4"
category: "压力追问"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "draft"
keywords: ["零拷贝边界", "文件桥", "tmp+rename", "flock", "简历纠冲突"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 为什么简历不再写零拷贝？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 因为当前源码能够确认的是 /tmp 文件桥，且整条链路还包含采集、直方图累计、文件读写、SPI 和纹理上传等搬运，没有证据支持端到端零拷贝。简历 V1 改为直接描述 tmp+rename、flock、CRC 和 seq，这些都是可从实现和日志继续追问的事实。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q19.4`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/嵌入式Linux简历V1-三项目面试问答.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
