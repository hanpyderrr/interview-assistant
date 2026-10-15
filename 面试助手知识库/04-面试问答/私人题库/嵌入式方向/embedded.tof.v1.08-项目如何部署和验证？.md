---
id: "embedded.tof.v1.08"
category: "单光子 TOF 成像终端 V1"
fact_status: "prepared_answer"
review_status: "codex_draft"
evidence_status: "draft"
keywords: ["systemd", "init.d", "Buildroot SDK", "交叉编译", "部署", "实机验证"]
project_ids: ["tof"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# 项目如何部署和验证？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：Codex草稿（codex_draft）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> N97 侧使用 systemd 管理采集与 SPI 推送进程，RK3568 侧使用 BusyBox `init.d` 控制 SPI 接收和 Qt 显示的启动顺序；RK 端应用通过厂商 Buildroot SDK 交叉编译并部署到板端。当前仓库可以支持“使用 Buildroot SDK 交叉编译和 `init.d` 部署”，不能支持“完成根文件系统裁剪”。raw reader 固化后，35 个实机样本的发布间隔为 203—208 ms；`spi_syncer` 10 秒发送 50 帧、`dropped=0`，RK 端收到 4118 B v2 帧且 seq 持续递增。

请同时查看 [[06-原始资料/阅读边界与缺失资料|版本差异说明]]，避免混用旧版与 V1 的协议、校验和架构描述。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.tof.v1.08`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/嵌入式Linux简历V1-三项目面试问答.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
