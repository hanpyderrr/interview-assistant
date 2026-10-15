---
id: "embedded.Q6.15"
category: "网络协议"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["ping", "ip", "route", "ss", "tcpdump", "ICMP", "抓包"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 如何使用 ping、ip、route、ss、tcpdump 排查网络问题？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> ip link/addr/route 看接口、地址和路由（老系统可用 route -n）；ping 分别验证本机接口、网关和远端 IP；ss -lntp/-tanp/-ti 看监听、连接状态和 TCP 指标；tcpdump -ni 接口 host ... and port ... 验证报文是否发出、返回及是否重传。ICMP 被禁不能直接证明业务不通；抓包位置会受 NAT、offload 和多网卡影响。还需用域名解析工具与实际客户端验证 DNS、TLS 和应用协议。最好按真实问题给出“现象—命令—证据—结论”，并注意抓包脱敏。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q6.15`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/05_网络与嵌入式Linux.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
