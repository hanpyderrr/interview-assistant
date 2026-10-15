---
id: "embedded.Q7.9"
category: "嵌入式Linux"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["设备节点", "devtmpfs", "udev", "probe", "dmesg", "权限排查"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 你的应用依赖哪些设备节点？节点不存在或权限错误时如何排查？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 先按真实项目列出设备节点，例如 SPI、串口、GPIO 或显示节点；节点由相应内核驱动成功 probe 后通过 devtmpfs/udev/mdev 创建。不存在时查设备树状态、驱动配置与加载、dmesg probe 错误、/sys/class 和模块绑定；存在但打不开时查权限、用户组、SELinux/AppArmor 及占用情况。chmod 777 只能掩盖权限问题，不能修复驱动未绑定，也不是生产方案；还要区分路径写死、编号变化和资源被其他进程独占。未确认的节点名不写入答案。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q7.9`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/05_网络与嵌入式Linux.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
