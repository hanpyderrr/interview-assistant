---
id: "embedded.temperature.v1.04"
category: "冰体多点温度采集系统 V1"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "draft"
keywords: ["FatFs", "SD卡", "RTC", "按日文件", "数据记录"]
project_ids: ["ice_temperature"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# SD 卡数据如何组织？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 启动时挂载 FatFs 并创建 `MAX31865_DATA` 目录。每次采集后读取 RTC 日期和时间，按 `YYYY-MM-DD.txt` 生成当天文件，以追加方式写入日期、时间、通道编号和温度，然后关闭文件。优点是数据直观，断电后单次记录影响范围小；缺点是每个通道都打开、写入、关闭一次，开销和 SD 写放大会偏大。后续可以按一轮采集组织批量缓冲，再统一写入并检查 `f_open`、`f_printf`、`f_sync` 的返回值。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.temperature.v1.04`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/嵌入式Linux简历V1-三项目面试问答.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
