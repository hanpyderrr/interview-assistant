---
id: "edge.stt.qa.001"
category: "面试助手本地语音转文字"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "verified"
keywords: ["Paraformer", "FunASR", "ONNX", "INT8", "CPU推理", "模型选型", "隐私"]
project_ids: ["interview_assistant"]
target_roles: ["embedded_linux", "ai_agent"]
熟练度: "未练习"
来源版本: "670911b"
---
# 为什么选择 Paraformer ONNX INT8 CPU 本地推理？

> [!note] 事实边界
> 项目集成的是 `iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-onnx`，通过 `funasr-onnx` 加载，配置 `batch_size=1`、`quantize=True`，CPU 线程数限制在 1～4。这里能证明模型接入与端侧服务封装，不能说成独立训练或亲自完成量化转换。

先尝试口述，再展开答案。

> [!note]- 参考答案
> 面试场景以中文为主，又需要降低云端密钥、网络波动、费用和音频外发带来的依赖，所以增加本地 Paraformer 路线。ONNX 运行时适合把模型作为独立 Python 服务部署，Electron 只需要遵守稳定的 HTTP/PCM 契约。当前使用 INT8 CPU 配置，是在普通桌面设备上控制内存和计算开销的工程选择，模型只加载一次，单句按 batch 1 推理。
>
> 选择是否成立不能只靠“INT8 更快”。应该用固定音频集记录模型加载时间、实时率或单句耗时、字错率/人工纠错率、峰值内存和长时间稳定性，再与云端 STT 或本地 Whisper 比较。当前代码会返回 `model_load_seconds` 和 `inference_seconds`，但知识库没有固定数据集的完整对比结果，因此面试时只报告已有实测，不编造精度或加速倍数。

> 这属于模型接入与端侧服务封装，不代表独立训练、亲自量化转换或 NPU/RKNN 部署经验。

## 经验边界
- 已做：Paraformer ONNX INT8 CPU 服务封装、Electron 接线、输入输出契约、生命周期与异常处理。
- 未证明：LoRA/QLoRA 训练、模型结构修改、PTQ/QAT 过程、NPU/RKNN 部署、固定基准上的量化精度损失。

## 证据
- `local-funasr/download_model.py`
- `local-funasr/requirements.txt`
- `local-funasr/service.py`

[[01-项目经历/面试助手语音转文字-阅读入口|返回项目入口]] · [[08-嵌入式AI/端侧AI补课清单|端侧AI补课清单]]
