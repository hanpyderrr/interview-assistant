---
id: "ai.AI7.3"
category: "桌面端"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["Tauri", "sidecar", "生命周期", "健康检查", "优雅退出", "NSIS"]
project_ids: ["plankiller"]
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# Tauri+Python sidecar 的启动、通信和退出生命周期如何管理？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> Tauri 启动时以受控参数拉起 sidecar，等待健康检查通过后前端再请求 API；端口、数据目录和日志路径由配置确定，避免硬编码冲突。关闭窗口时发送优雅退出信号并等待，超时才 kill，避免残留进程；启动失败显示可诊断错误。打包时固定 Python 依赖、sidecar 版本和资源路径，安装/升级后验证数据库持久化。PlanKiller 已完成 sidecar/NSIS 集成，但关闭后进程生命周期仍是需要继续加强的风险点。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.AI7.3`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/11_AI应用系统工程师专项答案.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
