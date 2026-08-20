# 面试知识库配置

仓库不包含作者的个人简历、题库或面试答案。首次使用时，请在本目录自行创建：

```text
knowledge_source/embedded_kb.jsonl
```

可以复制 `embedded_kb.example.jsonl` 作为起点。该文件采用 JSONL 格式，每行必须是一个独立 JSON 对象，支持以下字段：

- `id`：全库唯一标识。
- `title`：条目标题。
- `category`：分类，例如 `embedded`、`linux`、`cpp`。
- `fact_status`：建议使用 `prepared_answer`；只有来自本人简历且确认真实的内容才使用 `resume_fact`。
- `content`：用于检索和生成答案的正文。
- `source_paths`：来源说明数组，不要填写密码、Cookie、Token 或私钥路径。
- `keywords`：技术术语和常见问法数组。
- `review_status`（扩展字段，可选）：`none` | `codex_draft` | `cc_pending` | `confirmed`，表示该条目的审核状态；当前主要标记 `cc_pending`（CC 审核阻塞，内容为初稿）。

示例：

```json
{"id":"qa.example.spi","title":"SPI 驱动设计","category":"embedded","fact_status":"prepared_answer","review_status":"cc_pending","content":"在这里填写经过确认的面试回答。","source_paths":["user-provided"],"keywords":["SPI","驱动","DMA"]}
```

## 知识库方向（2026-08-13）

- 现阶段只使用 `embedded_kb.jsonl`（嵌入式方向）。
- 方向由设置 `interviewKbDirection`（`userData/settings.json`）决定：`embedded`（默认）或 `ai`。选择的方向对应的 KB 文件缺失时检索报错（fail-closed），不会回退到另一方向。
- `ai_kb.jsonl` 暂不提供；AI 方向内容保留在主仓 `04_documents/企业求职准备/kb_manifest.json` 中，以后再导出。
- 检索运行时带进程级缓存：开发目录文件按 mtime+size 失效，打包（ASAR）内文件按进程生命周期缓存。

## 导出管道

`embedded_kb.jsonl` 由主仓导出脚本生成（不手工编辑）：

```powershell
python E:\workspace\04_documents\企业求职准备\tools\export_kb.py
```

脚本读 `kb_manifest.json`，按 `export.directions`（当前 `["embedded"]`）生成 JSONL；覆盖前自动备份到 `E:\workspace\01_projects\interview-assistant\backups\`。

## 注意事项

1. 一行只能放一个 JSON 对象，文件使用 UTF-8 编码。
2. 不要提交个人简历、真实公司机密、API Key、Cookie 或其他凭据。
3. 修改后可运行 `node scripts/interview-retriever.mjs "SPI 驱动如何设计"` 检查检索结果。
4. 如果缺少 `embedded_kb.jsonl`，应用仍可启动，但面试题库检索会提示知识库不可用。
