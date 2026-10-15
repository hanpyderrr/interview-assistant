---
id: "embedded.Q7.8"
category: "嵌入式Linux"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["init.d", "SysV", "PID", "supervisor", "respawn", "TERM/KILL"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# init.d 脚本如何启动、停止和重启服务？如何处理依赖和异常拉起？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> SysV 风格脚本对 start|stop|restart 分支实现启动、发送终止信号、等待退出和再启动，并维护可靠的 PID/进程识别；通过 SNNname 链接顺序或启动脚本顺序处理依赖。异常拉起更适合由专门 supervisor、BusyBox init respawn 或守护进程管理。脚本应幂等，先确认设备节点、目录和网络等前置条件，使用超时与 TERM→KILL 的有限升级，避免按模糊进程名误杀；无限快速重启会形成故障循环，应退避并记录退出原因。按真实 init 系统回答，未做 supervisor 时可给设计建议，不称已实现。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q7.8`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/05_网络与嵌入式Linux.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
