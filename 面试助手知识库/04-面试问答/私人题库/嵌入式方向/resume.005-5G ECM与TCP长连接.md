---
id: "resume.005"
category: "网络/5G"
fact_status: "resume_fact"
review_status: "confirmed"
evidence_status: "verified"
keywords: ["ECM", "虚拟网卡", "QTcpServer", "QTcpSocket", "阿里云", "TCP", "断线重连", "历史版本"]
project_ids: ["tof"]
target_roles: ["embedded_linux"]
熟练度: "未练习"
来源版本: "TOF4.0-cloud-qt-server"
---
# 5G ECM与TCP长连接

> [!note] 版本边界
> 用户已确认阿里云 Qt/TCP 链路可证实，仓库也存在服务端和 RK3568 客户端源码。它是独立历史路径，不是当前 SPI→MIPI 主链路的直接下游；两种版本应分别回答。

先尝试口述，再展开源库答案。

> [!note]- 当前口述答案
> TOF 项目存在两条云端版本线。当前重构后的主链路以 N97→SPI→RK3568→MIPI 本地显示为主，5G `cloud_syncer` 只完成 HTTP/FastAPI 离线端到端验证。另一个已完成的历史版本在阿里云 Linux 上部署 Qt TCP 服务端：服务端以 `QTcpServer` 监听连接、接收定长深度数据、生成 32×32 图像并落盘；RK3568 客户端使用 `QTcpSocket` 连接阿里云，监听 `connected`、`disconnected`、`errorOccurred` 和 `readyRead`，断开或出错后由 `QTimer` 触发重连。面试时可以说明历史版本完成过 Qt/TCP 云端链路，但不能说它已经接入当前 TofFrame/SPI 重构链路，也不要把固定 500 ms 重试说成指数退避或心跳机制。

## 我的口述与补充
在这里写自己的表达、真实证据和需要进一步核对的问题。

## 来源
- 条目 ID：`resume.005`
- 服务端证据：`TOF4-only/versions/TOF4.0/cloud/qt_server/src/`。
- 客户端证据：`TOF4-only/versions/TOF4.0/rk3568/legacy/客户端代码/SinglePhoton207_5/clientAliyun.*`。
- 版本说明：`TOF4-only/versions/TOF4.0/docs/software-map/README.md`。

[[04-面试问答/私人知识库总览|私人题库总览]] · [[05-面试复盘/复习记录|复习记录]]
