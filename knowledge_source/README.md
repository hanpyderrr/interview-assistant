# 统一面试知识库

应用只读取一个私人知识库：

```text
interview_kb.jsonl
```

它同时服务 AI Agent 与嵌入式 Linux 面试，不再使用 `ai_kb.jsonl`、`embedded_kb.jsonl` 或方向设置。真实知识库不进入 Git，也不会打进安装包；仓库只保留虚构的 `interview_kb.example.jsonl`。

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
