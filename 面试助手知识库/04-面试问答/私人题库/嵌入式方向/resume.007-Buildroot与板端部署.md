---
id: "resume.007"
category: "Buildroot/工程化"
fact_status: "resume_fact"
review_status: "none"
evidence_status: "draft"
keywords: ["Buildroot", "SDK", "交叉编译", "init.d", "CMake", "Makefile"]
project_ids: ["tof"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# Buildroot与板端部署

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：未设置审核（none）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 基于 RK3568 厂商 Buildroot SDK 完成 C/C++/Qt 应用交叉编译、运行库部署、init.d 自启与 MIPI-DSI 显示链路联调。当前仓库没有 defconfig、自定义 package、rootfs overlay 或裁剪前后镜像对比，因此不声称已完成根文件系统裁剪。后续可在厂商 BSP 内通过 defconfig、BusyBox/package 配置和 BR2_EXTERNAL 做可复现定制，并用镜像大小、启动时间及 MIPI/USB-SPI/UART/Qt 回归结果验证；不为了简历贸然跨版本升级与板级驱动绑定的 Buildroot。

请同时查看 [[06-原始资料/阅读边界与缺失资料|版本差异说明]]，避免混用旧版与 V1 的协议、校验和架构描述。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`resume.007`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/个人信息.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
