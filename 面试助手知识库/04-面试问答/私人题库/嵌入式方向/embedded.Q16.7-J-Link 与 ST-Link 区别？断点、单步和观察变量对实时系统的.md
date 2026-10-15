---
id: "embedded.Q16.7"
category: "物联网存储"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["J-Link", "ST-Link", "SWD/JTAG", "断点", "非侵入跟踪", "DBGMCU"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# J-Link 与 ST-Link 区别？断点、单步和观察变量对实时系统的影响？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> ST-Link 面向 STM8/STM32，成本低且与 ST 工具集成；J-Link 支持更多厂商和高级调试/下载能力，具体功能取决于型号与许可证；两者都可通过 SWD/JTAG 调试 Cortex-M。断点/单步会暂停内核，外设、看门狗或外部设备未必同步暂停；实时观察可能占用调试带宽，软件断点还会改写指令存储。调并发/时序问题优先用非侵入跟踪、内存日志或 GPIO 打点；确认 DBGMCU 是否冻结定时器/看门狗，不能把断点下的行为当真实运行行为，调试时应记录外设是否被同步暂停。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q16.7`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/08_物联网存储与硬件调试.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
