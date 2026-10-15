---
id: "embedded.Q8.10"
category: "Qt线程"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["OpenGL", "QLabel", "QImage", "GPU合成", "纹理复用", "帧率稳定"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 为什么使用 OpenGL 显示，而不是 QLabel 或 QImage 直接绘制？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 对持续高分辨率图像、缩放、伪彩和多层叠加，OpenGL 可把采样、颜色映射和合成放到 GPU，并复用纹理，通常更容易稳定帧率；QLabel/QImage 方案实现简单，低帧率、小图或静态显示足够，且调试维护成本低。OpenGL 不保证天然更快：若每帧仍做昂贵 CPU 转换、同步等待或重复创建纹理，优势会消失。选择应以 CPU 占用、上传耗时、帧率和时延测量为依据；没有 A/B 数据时用需求论证，不造性能提升百分比。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q8.10`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/06_Qt显示与电机控制.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
