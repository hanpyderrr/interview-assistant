---
id: "embedded.Q2.14"
category: "C/C++基础"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["std::string", "std::span", "字节容器", "协议解析", "固定长度缓冲区", "NUL终止"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# std::string、裸字符数组和固定长度缓冲区在协议解析中如何选择？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 文本且需要字符串操作时用 std::string；任意二进制协议优先用 std::vector<std::byte>、std::array<std::byte, N> 或 std::span 表达缓冲区，而不是依赖 NUL 结尾的字符串语义。固定上限明确、不能动态分配的嵌入式热路径可用固定长度数组，但必须同时维护有效长度。裸字符数组容易出现越界、忘记终止符和容量/长度混淆；std::string 可以保存 \0，但其文本接口容易让人误把二进制数据当 C 字符串。容器解决所有权，span 只提供非拥有视图，调用者必须保证底层生命周期。SPI 接收字节流建议用字节容器保存，用游标与长度解析；协议文本字段转换为字符串前先校验长度和编码。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q2.14`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/02_C与C++基础.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
