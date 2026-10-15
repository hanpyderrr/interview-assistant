---
id: "embedded.Q6.10"
category: "网络协议"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["DHCP", "默认路由", "DNS", "ip命令", "ping", "tcpdump", "分层排障"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 设备如何获得 IP、默认路由和 DNS？如何排查网卡存在但无法联网？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 地址可能由 DHCP、静态配置或点到点控制协议获得；默认路由决定非直连目的的下一跳，DNS 将域名解析为地址。排查按层次进行：链路状态与驱动、IP/掩码、路由、网关连通、外网 IP、DNS、端口与应用。用 ip link/addr/route 查配置，先 ping 网关再 ping 公网 IP，再用 getent hosts/nslookup 测 DNS；用 ss、tcpdump -i 接口看连接与报文。多网卡时还要检查路由优先级、源地址选择、策略路由、防火墙和模组数据业务状态。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q6.10`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/05_网络与嵌入式Linux.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
