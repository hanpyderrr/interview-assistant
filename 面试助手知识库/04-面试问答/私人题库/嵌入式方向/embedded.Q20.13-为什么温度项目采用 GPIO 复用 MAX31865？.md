---
id: "embedded.Q20.13"
category: "压力追问"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "draft"
keywords: ["STM32F767", "MAX31865", "GPIO复用", "PT1000", "通道选通"]
project_ids: ["ice_temperature"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 为什么温度项目采用 GPIO 复用 MAX31865？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 温度项目实际不是远端总线轮询，而是 STM32F767 用多级 GPIO 地址切换测点，复用一套 MAX31865 测量 PT1000。这样减少转换前端数量，代价是要管理开关导通电阻、线阻、串扰和切换稳定时间。数据落 SD，并由 ESP8266 上传；远距离总线方案只作为通用知识回答。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q20.13`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/嵌入式Linux简历V1-三项目面试问答.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
