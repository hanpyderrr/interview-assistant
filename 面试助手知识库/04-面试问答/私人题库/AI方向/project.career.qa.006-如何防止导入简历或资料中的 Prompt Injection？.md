---
id: "project.career.qa.006"
category: "Career Evidence Lab"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "in_progress"
keywords: ["Prompt Injection", "沙箱解析", "Schema校验", "不可信输入", "安全边界"]
project_ids: ["career_evidence_lab"]
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "06b8f4d+working-tree"
---
# 如何防止导入简历或资料中的 Prompt Injection？

> [!warning] 当前边界
> 文档解析隔离、大小与格式限制、来源锚点和 Schema 校验已实现；动态模型链路中的 Prompt Injection 对抗仍需随 P3.2 完整验证。

先尝试口述，再展开源库答案。

> [!note]- 当前口述答案
> 当前导入链路把 TXT、MD、DOCX 和文本 PDF 都当作不可信输入。DOCX/PDF 在一次性 Electron Utility Process 中解析，设置 15 秒硬超时和进程清理；限制格式、文件大小、正文和 source map，并拒绝 PDF active content、附件等危险结构。解析结果必须通过严格 Schema 和来源锚点校验后才能进入 SQLite，事实还需要用户确认。动态 Agent 侧继续把系统指令与资料正文分开，并要求模型输出通过角色专属 Schema 和逐字引文检查。前一部分已有真实 Electron 验证，后一部分仍随动态 Agent 闭环开发，不能说 Prompt Injection 已被完全解决。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`project.career.qa.006`
- 已提交证据：`06b8f4d` 的文档导入与事实审核链路。
- 在研证据：动态 Agent 合同、Worker 和 Gateway。

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
