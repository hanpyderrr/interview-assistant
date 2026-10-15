---
id: "embedded.Q2.7"
category: "C/C++基础"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["大小端", "字节序", "ntohs/ntohl", "std::endian", "网络协议", "测试向量"]
project_ids: ["tof"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 大小端是什么？协议解析时如何安全地处理字节序？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 大端把多字节整数的最高有效字节放在低地址，小端相反。字节序是多字节字段的编码约定，单字节没有大小端问题。协议必须明确线上的字节序，解析时逐字段转换到主机序。网络协议常用大端，但私有协议要以协议文档为准。可使用 ntohs/ntohl、对应 64 位转换，或按字节移位组合；C++20 的 std::endian 用于识别本机序，C++23 有 std::byteswap。不要把任意字节地址强转为整数或结构体指针，因为还涉及对齐、严格别名和对象生命周期。项目结合：TofFrame 深度帧协议定为小端——magic、seq、width/validCount、depths、crc16 全部按 LE 解析；哪吒（x86_64）与 RK3568（aarch64）本机序都是小端，但解析代码仍显式按字节组合（read_le32/read_le16），不依赖本机序。发送与接收共用同一头文件 depth_proto.h，CRC16-Modbus 用固定测试向量验证（test_tof_frame_v2 / test_tof_stream_framer）。

请同时查看 [[06-原始资料/阅读边界与缺失资料|版本差异说明]]，避免混用旧版与 V1 的协议、校验和架构描述。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q2.7`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/02_C与C++基础.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
