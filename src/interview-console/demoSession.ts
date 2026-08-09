export type SessionStatus = 'ready' | 'recording' | 'transcribing' | 'answered'
export type TranscriptEvent = { text: string; confirmed?: boolean }
export type KnowledgeHit = { id: string; title: string; source: 'resume_fact' | 'prepared_answer' | 'reference'; score: number; excerpt: string }
export type AnswerPayload = { spoken: string; project: string; followUps: string[]; boundaries: string[] }
export const DEMO_QUESTION = '请介绍一下你在智能家居能耗监测平台上完成的实时数据链路，是怎样设计的？'
export const DEMO_TRANSCRIPT: TranscriptEvent[] = [
  { text: '请介绍一下你在智能家居能耗监测平台上完成的实时数据链路', confirmed: false },
  { text: DEMO_QUESTION, confirmed: true },
]
export const DEMO_HITS: KnowledgeHit[] = [
  { id: 'resume.002', title: '能耗监测平台总体架构', source: 'resume_fact', score: 23.25, excerpt: '基于 Linux 嵌入式网关与云端服务，包含传感器数据采集、本地规则引擎、可视化看板和远程告警推送。' },
  { id: 'resume.003', title: '设备通信接口与协议解析', source: 'resume_fact', score: 8.25, excerpt: '通过状态机完成报文帧同步和字段解析，结合帧头、长度与校验和过滤异常帧。' },
  { id: 'prepared.004', title: '网关部署口述框架', source: 'prepared_answer', score: 5, excerpt: '配置工具链、裁剪根文件系统、加入应用和启动脚本，再进行交叉编译、刷写和串口验证。' },
]
export const DEMO_ANSWER: AnswerPayload = {
  spoken: '这个平台以嵌入式网关为主控，运行 Linux。数据链路上，前端通过串口接收传感器报文，先在接收侧完成帧同步、长度校验和校验和校验，再通过进程间通信把数据交给处理和展示模块。Web 看板负责本地可视化，同时将预处理后的数据通过 TCP 长连接上传云端。具体吞吐量、延迟和云端接口参数，需要以项目记录为准。',
  project: '我实际参与的是报文接收与协议解析、进程拆分、看板展示和 TCP 长连接这条链路。',
  followUps: ['为什么选择进程间通信而不是线程？', '校验和校验失败时如何处理？', '网关如何裁剪并部署到板端？'],
  boundaries: ['不要补充未记录的吞吐量、延迟或代码量。', '不要把通用 IPC 原理表述成已经落地的具体性能收益。'],
}
export function nextStatusAfterStart(): SessionStatus { return 'recording' }
