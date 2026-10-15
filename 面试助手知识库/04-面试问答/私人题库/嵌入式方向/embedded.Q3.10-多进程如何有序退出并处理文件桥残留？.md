---
id: "embedded.Q3.10"
category: "Linux并发"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "draft"
keywords: ["SIGTERM", "有序退出", "文件桥", "残留文件", "systemd"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 多进程如何有序退出并处理文件桥残留？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 用 SIGTERM 请求退出，信号处理函数只设置 sig_atomic_t 标志，主循环停止接收新数据后完成当前帧、关闭设备和文件描述符。服务管理器负责超时与重启。文件桥启动时先校验正式文件 magic、长度、CRC 和 seq，不合法就忽略；临时文件由写端按固定命名清理，不能把任意 /tmp 文件作为删除目标。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q3.10`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/嵌入式Linux简历V1-三项目面试问答.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
