export type SessionStatus = 'ready' | 'recording' | 'transcribing' | 'answered'
export type TranscriptEvent = { text: string; confirmed?: boolean }
export type KnowledgeHit = { id: string; title: string; source: 'resume_fact' | 'prepared_answer' | 'reference'; score: number; excerpt: string }
export type AnswerPayload = { spoken: string; project: string; followUps: string[]; boundaries: string[] }
export const DEMO_QUESTION = '请介绍一下你在 RK3568 和 Buildroot Linux 上完成的单光子成像系统，数据链路是怎样设计的？'
export const DEMO_TRANSCRIPT: TranscriptEvent[] = [
  { text: '请介绍一下你在 RK3568 和 Buildroot Linux 上完成的单光子成像系统', confirmed: false },
  { text: DEMO_QUESTION, confirmed: true },
]
export const DEMO_HITS: KnowledgeHit[] = [
  { id: 'resume.002', title: '单光子成像系统总体架构', source: 'resume_fact', score: 23.25, excerpt: '基于 RK3568 与 Buildroot Linux，包含 TCSPC 光子数据接收、双电机自动调焦、本地图像显示和 5G 云端传输。' },
  { id: 'resume.003', title: 'SPI 设备接口与协议解析', source: 'resume_fact', score: 8.25, excerpt: '通过状态机完成光子字节流帧同步和协议字段解析，结合帧头、长度和 CRC32 过滤异常帧。' },
  { id: 'prepared.004', title: 'Buildroot 部署口述框架', source: 'prepared_answer', score: 5, excerpt: '配置工具链、裁剪根文件系统、加入应用和启动脚本，再进行交叉编译、刷写和串口验证。' },
]
export const DEMO_ANSWER: AnswerPayload = {
  spoken: '这个系统以 RK3568 为主控，运行 Buildroot Linux。数据链路上，前端通过 SPI 接收 TCSPC 光子数据，先在接收侧完成帧同步、长度校验和 CRC32 校验，再通过进程间通信把数据交给处理和显示模块。Qt 负责本地图像显示，同时将预处理后的数据通过 TCP 和 5G ECM 虚拟网卡上传云端。具体吞吐量、延迟和云端接口参数，需要以项目记录为准。',
  project: '我实际参与的是 SPI 数据接收与协议解析、Linux 进程拆分、Qt 显示和 5G TCP 长连接这条链路。',
  followUps: ['为什么选择进程间通信而不是线程？', 'CRC32 校验失败时如何处理？', 'Buildroot 如何裁剪并部署到板端？'],
  boundaries: ['不要补充未记录的吞吐量、延迟或代码量。', '不要把通用 IPC 原理表述成已经落地的具体性能收益。'],
}
export function nextStatusAfterStart(): SessionStatus { return 'recording' }
