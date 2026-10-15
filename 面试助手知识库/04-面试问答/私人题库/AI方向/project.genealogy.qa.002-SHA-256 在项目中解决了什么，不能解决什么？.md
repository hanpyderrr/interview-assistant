---
id: "project.genealogy.qa.002"
category: "族谱数字化 Agent"
fact_status: "prepared_answer"
review_status: "confirmed"
evidence_status: "verified"
keywords: ["SHA-256", "一致性校验", "篡改", "数字签名", "哈希清单"]
project_ids: ["genealogy_agent"]
target_roles: ["ai_agent"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# SHA-256 在项目中解决了什么，不能解决什么？

> [!warning] 阅读边界
> 证据：源库标为已验证（verified）；审核：源库标为已确认（confirmed）。状态沿用源库，本次导入未重新核验事实。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 项目记录每张原图的 SHA-256，用来核对复制前后是否一致，并在后续运行中发现文件内容变化。它不能阻止别人修改文件；如果攻击者同时替换文件和清单，普通哈希也无法证明来源可信。若需要防篡改，还要增加只读存储、签名或受控审计日志。简历只写“用于原图一致性校验”。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`project.genealogy.qa.002`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `kb/unified/six-project-evidence-audit.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
