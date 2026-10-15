---
id: "ai.AI4.7"
category: "推理"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["自建推理", "GPU服务", "量化", "vLLM", "Ollama", "KV cache", "Tokenizer"]
project_ids: []
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 你做过自建模型推理、量化或 GPU 服务吗？没有的话如何回答？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 应诚实说：“我目前做过的是 OpenAI-compatible 模型服务接入和推理编排，没有独立部署 GPU 推理集群、量化模型或训练基础模型。”随后说明理解的链路：模型权重加载、Tokenizer、批处理、KV cache、GPU 显存、并发队列、量化精度与吞吐/延迟权衡；并给出学习计划，用 vLLM/TGI/Ollama 做小规模实验，比较 FP16/INT8、batch、首 token 延迟和 tokens/s。不要把调用 API 说成自建推理。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.AI4.7`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/11_AI应用系统工程师专项答案.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
