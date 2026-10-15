---
id: "embedded.Q6.9"
category: "网络协议"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["ECM", "USB CDC", "5G模组", "usb0", "QMI", "MBIM", "虚拟网卡"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 5G 模组 ECM 模式是什么？为什么系统中会出现虚拟网卡？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> ECM 是 USB CDC 的以太网控制模型。模组完成蜂窝侧拨号和数据承载，并通过 USB 向主机暴露一个类似以太网的网络接口；Linux 的 USB 网络驱动绑定后创建 usb0、ethX 等网络设备，因此应用按普通 IP 网卡使用。具体拨号、NAT、DHCP 或桥接行为取决于模组固件和工作模式；ECM 与 QMI/MBIM 的控制路径不同，不能仅看到虚拟网卡就断言地址由谁分配。未确认型号时不编造接口名和 AT 命令。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q6.9`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/05_网络与嵌入式Linux.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
