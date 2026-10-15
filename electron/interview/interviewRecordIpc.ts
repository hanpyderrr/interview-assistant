import { BrowserWindow, dialog, app } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import { DatabaseManager } from '../db/DatabaseManager';
import { SettingsManager } from '../services/SettingsManager';
import { InterviewRecordStore } from './InterviewRecordStore';
import { formatInterviewRecord } from './interviewRecordExport';

export function registerInterviewRecordIpc(handle: (channel: string, fn: (event: any, ...args: any[]) => any) => void): void {
  let store: InterviewRecordStore | undefined;
  const owners = new Map<string, number>();
  const getStore = () => {
    if (!store) {
      const db = DatabaseManager.getInstance().getDb();
      if (!db) throw new Error('本地数据库尚未就绪，请稍后重试');
      store = new InterviewRecordStore(db);
    }
    const retention = SettingsManager.getInstance().get('meetingRetention') ?? 'forever';
    if (retention === '7d' || retention === '30d') store.prune(retention === '7d' ? 7 : 30);
    return store;
  };
  const maySave = () => SettingsManager.getInstance().get('meetingRetention') !== 'never';
  const owned = (event: any, id: string) => {
    if (owners.get(id) !== event.sender.id) throw new Error('记录不属于当前面试窗口');
  };
  const mutation = (fn: (event: any, ...args: any[]) => any) => async (event: any, ...args: any[]) => {
    try { return await fn(event, ...args); }
    catch (error) { return { success: false, error: error instanceof Error ? error.message : '面试记录操作失败' }; }
  };
  handle('interview-record:begin', mutation((event, input) => {
    if (!maySave()) return { success: true, disabled: true };
    const id = getStore().begin(input);
    owners.clear(); owners.set(id, event.sender.id);
    return { success: true, id };
  }));
  handle('interview-record:save', mutation((event, id, rounds, turns) => {
    owned(event, id);
    if (!maySave()) { getStore().discard(id); owners.delete(id); return { success: true, disabled: true }; }
    getStore().save(id, rounds, turns);
    return { success: true };
  }));
  handle('interview-record:capture', mutation((event, id, enabled) => {
    owned(event, id); getStore().setCapture(id, enabled); return { success: true };
  }));
  handle('interview-record:end', mutation((event, id, status) => {
    owned(event, id);
    const disabled = !maySave();
    if (!disabled) getStore().end(id, status); else getStore().discard(id);
    owners.delete(id);
    return { success: true, disabled };
  }));
  handle('interview-record:list', (_event, offset = 0) => getStore().list(offset));
  handle('interview-record:get', (_event, id) => getStore().get(id));
  handle('interview-record:review', mutation((_event, id, roundId, review) => {
    getStore().review(id, roundId, review); return { success: true };
  }));
  handle('interview-record:export', mutation(async (event, id, format) => {
    if (!['json', 'markdown'].includes(format)) throw new Error('导出格式无效');
    const record = getStore().get(id);
    if (!record) throw new Error('记录不存在');
    const extension = format === 'json' ? 'json' : 'md';
    const options = {
      title: '导出面试记录',
      defaultPath: path.join(app.getPath('documents'), `面试记录-${new Date(record.startedAt).toISOString().replace(/[:.]/g, '-')}.${extension}`),
      filters: [{ name: format === 'json' ? 'JSON' : 'Markdown', extensions: [extension] }],
    };
    const parent = BrowserWindow.fromWebContents(event.sender);
    // Electron's modern runtime returns SaveDialogReturnValue; the repo also carries legacy dialog typings.
    const selected = (parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options)) as unknown as { canceled: boolean; filePath?: string };
    if (selected.canceled || !selected.filePath) return { success: true, canceled: true };
    await fs.writeFile(selected.filePath, formatInterviewRecord(record, format), { encoding: 'utf8', mode: 0o600 });
    return { success: true, path: selected.filePath };
  }));
}
