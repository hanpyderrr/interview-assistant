---
id: "embedded.Q9.4"
category: "MIPI显示"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["设备树panel", "驱动binding", "probe日志", "测试图", "BSP", "datasheet"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 你在 MIPI-DSI 调试中具体修改了什么、如何验证？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 这是贡献核验题。应按提交记录说明修改层次，例如设备树 panel/endpoint、时序/像素格式、供电复位 GPIO、初始化命令或驱动 binding；再说明验证证据，如 probe 日志、DRM mode、固定色/测试图、长时间稳定性和重启/冷热启动结果。必须把自己修改与 BSP 原有代码区分开，能解释每项修改为何与 datasheet 一致；若只完成配置适配，不应说成独立编写 DSI Host 驱动。当前资料没有参数，因此不编造修改值。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q9.4`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/06_Qt显示与电机控制.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
