---
id: "embedded.Q12.3"
category: "现场总线"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["Modbus RTU", "功能码", "CRC", "从站地址", "MBAP", "广播地址"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# Modbus RTU 帧格式是什么？地址、功能码、数据和 CRC 如何排列？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> RTU 应用数据单元依次是 1 字节从站地址、1 字节功能码、可变长度数据、2 字节 CRC；CRC 低字节先发送、高字节后发送。异常响应的功能码最高位置 1，数据中带异常码。RTU 没有 TCP 版的 MBAP 头，帧边界依赖静默间隔；数据区中寄存器值通常按高字节在前，但 CRC 的线上字节序相反，不能混淆。解析先校验长度/地址/CRC，再分派功能码，并严格检查响应字节数；广播地址 0 的写请求通常无响应。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q12.3`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/07_FreeRTOS与现场总线.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
