---
id: "ai.AI7.5"
category: "交付部署"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["CI", "安装包", "版本契约", "数据迁移", "回滚", "PyInstaller", "NSIS"]
project_ids: ["plankiller"]
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 如何把一个 AI 原型交付成可安装、可升级、可回滚的 Windows 应用？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 先固定前端/后端/sidecar 版本和配置契约，CI 构建并生成带版本号的安装包；安装数据目录与程序目录分离，升级前备份数据库并运行迁移；启动做健康检查，失败时保留旧版本或提供回滚；日志写入稳定位置。发布前测试安装、升级、卸载、断网、模型不可用、关闭窗口和数据持久化。PlanKiller 已有 PyInstaller + Tauri NSIS 构建和安装版烟测，但还需要补更系统的升级回滚验证。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`ai.AI7.5`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/11_AI应用系统工程师专项答案.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
