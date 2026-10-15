import type { InterviewRecord } from '../../shared/interviewRecords';
const quote = (s: string) => s.split('\n').map(line => `> ${line}`).join('\n');
const date = (n: number) => new Date(n).toISOString();
export function formatInterviewRecord(record: InterviewRecord, format: 'json' | 'markdown'): string {
  if (format === 'json') return JSON.stringify(record, null, 2) + '\n';
  const statuses = { active: '进行中', completed: '已结束', interrupted: '中断', queued: '排队中', generating: '生成中', answered: '已完成', error: '生成失败' };
  const ratings = { unreviewed: '未复盘', good: '可用', needs_work: '待改进' };
  const parts = ['# 面试记录', quote(record.title), `开始：${date(record.startedAt)}  结束：${record.endedAt ? date(record.endedAt) : '尚未结束'}`, `状态：${statuses[record.status]} · ${record.questionCount} 题`,
    quote(`公司：${record.profile.company || '未设置'}；岗位：${record.profile.position || '未设置'}；方向：${record.profile.role || '未设置'}`),
    `输入方式：${record.source === 'manual' ? '手动测试' : record.source === 'microphone' ? '麦克风 / USB' : '系统声音'}`,
    '说明：AI 回答为建议，不代表本人实际说过。本人回答单独列出，未自动与题目配对。记录未自动写入知识库。'];
  for (const r of record.rounds) {
    parts.push(`## 第 ${r.id} 题`, '### 问题', quote(r.question));
    if (r.originalQuestion !== r.question) parts.push('原始问题：', quote(r.originalQuestion));
    parts.push(`### AI 回答（${statuses[r.status]}）`, quote(r.answer || '尚未生成回答'), quote(`来源：${r.answerSource}；模型配置：${r.model || '未记录'}；回答级别：${r.answerLevel}；语言：${r.englishMode ? '英文' : '中文'}`),
      quote(`当时岗位：${r.profile.position}；方向：${r.scope.role || r.profile.role}；项目：${r.scope.projectIds?.join('、') || '未指定'}`));
    if (r.error) parts.push('错误：', quote(r.error));
    if (r.hits.length) parts.push('题库命中：', quote(r.hits.map(h => `${h.id} ${h.title} (${h.source || '未知来源'})`).join('\n')));
    parts.push(`### 复盘：${ratings[r.review.rating]}`, quote(r.review.note || '尚未填写'));
  }
  parts.push('## 本人实际回答（原始转写）');
  if (!record.candidateTurns.length) parts.push(record.captureCandidate ? '没有收到本人回答的有效转写。' : '未开启本人回答采集。');
  for (const t of record.candidateTurns) parts.push(date(t.at), quote(t.text));
  return parts.join('\n\n') + '\n';
}
