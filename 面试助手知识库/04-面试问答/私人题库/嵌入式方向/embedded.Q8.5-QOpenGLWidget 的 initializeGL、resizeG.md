---
id: "embedded.Q8.5"
category: "Qt线程"
fact_status: "prepared_answer"
review_status: "cc_pending"
evidence_status: "draft"
keywords: ["QOpenGLWidget", "initializeGL", "paintGL", "resizeGL", "shader", "makeCurrent"]
project_ids: []
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "9d334ac679da"
---
# QOpenGLWidget 的 initializeGL、resizeGL 和 paintGL 分别做什么？

> [!warning] 阅读边界
> 证据：草稿待核对（draft）；审核：待CC审核（cc_pending）。状态沿用源库，本次导入未重新核验事实。 请先核对项目事实与指标，再用于面试口述。

先尝试口述，再展开源库答案。

> [!note]- 源库答案（原文）
> initializeGL() 在 OpenGL context 已 current 后执行一次性资源初始化，如 shader、纹理和 buffer；resizeGL(w,h) 在尺寸变化时更新 viewport/projection；paintGL() 在需要重绘时绑定资源、上传/选择当前帧并发出绘制命令。OpenGL 调用应在 context current 的线程和时机执行；paintGL() 要短且避免阻塞；资源释放也需要有效 context，可在析构/清理时 makeCurrent() 后释放再 doneCurrent()。若只是概念方案，不虚构 PBO 等优化已落地。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`embedded.Q8.5`
- 导入版本：`9d334ac679dac87bc03fcce00d6b67f8c101ad23`
- 原始来源说明（保留源库路径，未假定这些文件在本机存在）：
- `简历与个人档案/AI应用系统工程师技术面试准备/06_Qt显示与电机控制.md`

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
