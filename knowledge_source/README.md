# 统一面试知识库

应用只读取一个统一知识库：

```text
interview_kb.jsonl
```

它同时服务 AI Agent 与嵌入式 Linux 面试，不再使用 `ai_kb.jsonl`、`embedded_kb.jsonl` 或方向设置。仓库现包含当前项目使用的 `interview_kb.jsonl`，以及虚构示例 `interview_kb.example.jsonl`；适合阅读的 Markdown 资料位于 [面试助手知识库](../面试助手知识库/使用说明.md)。

当前 JSONL 有 489 条知识，涵盖项目经历、嵌入式 Linux、AI Agent 和相关面试问答。Markdown 目录中的 `06-原始资料` 是历史来源快照，App 实际读取的是本目录的 JSONL。Markdown 编辑不会自动同步到运行时知识库。

部分 `source_paths` 保留原始本机来源位置，用于追溯资料；检索使用 JSONL 中的正文，不要求其他电脑具有相同目录。

上传源码不会改变安装包行为：当前打包配置仍排除真实 `interview_kb.jsonl`，安装版需要按下述路径单独配置。Obsidian 工作区状态、生成日志和真实问答测试报告不随本次知识库上传。

## 运行时地址

应用按顺序查找：

1. `<Electron userData>/knowledge_source/interview_kb.jsonl`；
2. 开发仓库的 `knowledge_source/interview_kb.jsonl`。

第一个路径适合已安装应用，第二个路径适合本仓库开发运行。两处都不存在时，检索会明确返回“统一知识库不可用”，不会回退到旧分库。

## 字段

每行是一个 UTF-8 JSON 对象，至少包含 `id`、`content` 和 `keywords`。推荐字段：

- `title`、`category`、`fact_status`、`review_status`；
- `source_paths`：来源说明，不能包含密码、Token 或凭据路径；
- `project_ids`：`tof`、`ice_temperature`、`wing_icing`、`plankiller`、`career_evidence_lab`、`genealogy_agent`；
- `target_roles`：`ai_agent`、`embedded_linux`；
- `evidence_status`：`verified`、`in_progress`、`planned`、`draft`、`reference`。

`planned` 与 `in_progress` 会在检索上下文中自动附加边界提示，避免把最终产品规划说成已实现成果。

## 生成

统一知识库由私人知识源生成，不手工维护 JSONL：

```powershell
cd <private-knowledge-base-root>
python tools\build_unified_kb.py
python tools\export_kb.py --manifest kb_manifest_unified.json
python tools\export_kb.py --manifest kb_manifest_unified.json --export-dir "$env:APPDATA\natively\knowledge_source"
```

前两条命令更新开发仓库，第三条更新已安装应用。旧文件备份写到私人知识源的 `backups/`。

## 检查

```powershell
node scripts\interview-retriever.mjs "TofFrame 的 CRC 能恢复丢失数据吗"
node scripts\interview-retriever.mjs "Career Evidence Lab 当前完成了哪些功能"
```
