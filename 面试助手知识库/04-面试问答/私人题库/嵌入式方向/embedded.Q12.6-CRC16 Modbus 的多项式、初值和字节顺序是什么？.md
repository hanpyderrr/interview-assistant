---
id: "embedded.Q12.6"
category: "现场总线"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["CRC16", "0xA001", "0xFFFF", "LSB-first", "反射多项式", "字节序"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# CRC16 Modbus 的多项式、初值和字节顺序是什么？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 初值为 0xFFFF，按 LSB-first 算法使用反射多项式 0xA001（等价正常表示 0x8005），不再异或输出；帧中先发送 CRC 低字节，再发送高字节。CRC 覆盖地址、功能码和数据，不包含 CRC 字段本身。实现必须明确移位方向，不能只写“多项式 0x8005”而忽略反射形式。用规范示例和已知向量做 PC 单元测试，再与抓包字节比对；CRC 只能检错，不能提供认证或防篡改。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q12.6`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/07_FreeRTOS与现场总线.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
