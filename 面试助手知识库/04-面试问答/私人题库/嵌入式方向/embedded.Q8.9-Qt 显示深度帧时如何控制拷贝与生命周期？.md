---
id: "embedded.Q8.9"
category: "Qt线程"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "draft"
keywords: ["Qt GUI线程", "QTimer", "QImage生命周期", "文件桥", "flock", "伪彩映射", "工作线程"]
project_ids: ["tof"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# Qt 显示深度帧时如何控制拷贝与生命周期？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> RK3568 当前用 16 ms QTimer 在 GUI 线程轮询 /tmp/received.dat；同一线程完成共享 flock 读取、version/长度/CRC/seq 校验、32×32 深度平滑、伪彩映射和 QImage 更新。QImage 是 DepthWidget 成员，像素写入它自己的缓冲，不引用 onTimer 的临时数组，因此不会留下悬空缓冲。当前单帧仅 2—4 KB、图像 32×32，实测可用；若分辨率或处理量增大，再把解析和映射移到 worker。

请同时查看 [[06-原始资料/阅读边界与缺失资料|版本差异说明]]，避免混用旧版与 V1 的协议、校验和架构描述。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q8.9`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/嵌入式Linux简历V1-三项目面试问答.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
