---
id: "embedded.Q8.11"
category: "Qt线程"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["QPA", "platform plugin", "QT_DEBUG_PLUGINS", "eglfs", "linuxfb", "qt.conf", "ldd"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# Qt 程序在交叉编译后找不到 platform plugin，如何排查？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> 设置 QT_DEBUG_PLUGINS=1 查看搜索路径和加载失败原因；确认部署了与目标 Qt 同版本/ABI 的 platform plugin（如 eglfs、linuxfb、xcb），检查 QT_QPA_PLATFORM_PLUGIN_PATH/qt.conf，再用 file、readelf -d 或目标机 ldd 检查架构、动态加载器及依赖库。“找到但无法加载”常是 plugin 的间接依赖缺失、ABI 不匹配或图形栈/EGL 设备未就绪，不只是路径错误。不要通过复制宿主机插件解决目标机问题；不同 QPA 后端所需设备节点和环境变量以 BSP 文档为准。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q8.11`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/06_Qt显示与电机控制.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
