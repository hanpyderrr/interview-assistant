---
id: "embedded.Q2.1"
category: "C/C++基础"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["malloc", "new/delete", "内存分配", "析构函数", "std::bad_alloc", "智能指针", "未定义行为"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# malloc/free 与 new/delete 有什么区别？混用会发生什么？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> malloc/free 是 C 的内存分配函数，只负责按字节申请和释放，失败时 malloc 返回空指针；new/delete 是 C++ 表达式，会按类型分配内存并调用构造/析构函数，普通 new 失败时默认抛出 std::bad_alloc。数组必须成对使用 new[]/delete[]。两套接口可能使用同一底层堆，但配对规则和对象生命周期语义不同：malloc 得到的存储不能直接当作已构造的非平凡 C++ 对象；用 free 释放 new 的结果，或用 delete 释放 malloc 的结果，属于未定义行为。现代 C++ 应优先使用自动对象、容器和智能指针，把裸分配限制在明确底层封装内；封装设备缓冲区时应说明所有权、分配端和释放端，跨模块传指针尤其要避免两边采用不同释放方式。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q2.1`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/02_C与C++基础.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
