---
id: "embedded.Q9.5"
category: "MIPI显示"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["DRM/KMS", "CRTC", "plane", "framebuffer", "eglfs", "linuxfb", "QPA"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# DRM/KMS、Framebuffer 和 Qt 显示后端之间是什么关系？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> DRM/KMS 是现代 Linux 图形子系统：DRM 管理 GPU/显示资源，KMS 配置 connector、CRTC、plane 和 mode；传统 framebuffer 通过 /dev/fbX 暴露较简单的像素缓冲接口。Qt 的 QPA 后端如 eglfs、linuxfb、wayland、xcb 选择不同路径把 Qt 窗口内容送到显示系统。linuxfb 通常功能简单且可能依赖软件绘制；eglfs 可通过 EGL/OpenGL ES 走 DRM/KMS 或厂商集成；Wayland/X11 下 Qt 先交给 compositor/server，再由其使用 DRM/KMS。具体后端由 Qt 构建配置、插件和 BSP 决定，应实测确认而不只凭环境变量猜。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q9.5`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/06_Qt显示与电机控制.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
