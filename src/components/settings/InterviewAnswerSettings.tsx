import React, { useState } from 'react';
import { INTERVIEW_PROMPT_MAX_LENGTH, loadInterviewPrompt, saveInterviewPrompt } from '../../interview-console/interviewPromptSettings';
import {
    INTERVIEW_PROJECTS,
    loadInterviewProfile,
    saveInterviewProfile,
    suggestInterviewProfile,
    type InterviewProfile,
    type InterviewRole,
} from '../../interview-console/interviewScope';

const ROLE_OPTIONS: Array<{ value: InterviewRole; label: string }> = [
    { value: '', label: '未限定' },
    { value: 'ai_agent', label: 'AI / Agent' },
    { value: 'embedded_linux', label: '嵌入式 / Linux' },
];

export const InterviewAnswerSettings: React.FC = () => {
    const [draft, setDraft] = useState(() => loadInterviewPrompt());
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [profileDraft, setProfileDraft] = useState<InterviewProfile>(() => loadInterviewProfile());
    const [profileMessage, setProfileMessage] = useState('');
    const [profileError, setProfileError] = useState('');
    const [suggestionNote, setSuggestionNote] = useState('');

    function save(value: string) {
        try {
            setDraft(saveInterviewPrompt(value));
            setError('');
            setMessage(value.trim() ? '已保存，下一道问题生效。' : '已恢复默认，下一道问题生效。');
        } catch {
            setMessage('');
            setError('保存失败，修改尚未生效。请重试。');
        }
    }

    function updateProfile(patch: Partial<InterviewProfile>) {
        setProfileMessage('');
        setProfileError('');
        setProfileDraft((current) => {
            const next = { ...current, ...patch };
            // A default project must match the selected direction; otherwise clear it.
            const project = next.defaultProjectId
                ? INTERVIEW_PROJECTS.find((item) => item.id === next.defaultProjectId)
                : undefined;
            if (project && next.role && project.role && project.role !== next.role) {
                next.defaultProjectId = '';
            }
            return next;
        });
    }

    function saveProfile() {
        try {
            setProfileDraft(saveInterviewProfile(profileDraft));
            setProfileError('');
            setProfileMessage('面试配置已保存，下一道问题生效。');
        } catch {
            setProfileMessage('');
            setProfileError('面试配置保存失败，修改尚未生效。请重试。');
        }
    }

    function extractProfileSuggestion() {
        // Only fills the edit form; the user still has to confirm and save.
        setProfileDraft(suggestInterviewProfile(draft));
        setProfileMessage('');
        setProfileError('');
        setSuggestionNote('已根据补充提示词填入建议，请核对后保存。');
    }

    const visibleProjects = profileDraft.role
        ? INTERVIEW_PROJECTS.filter((project) => !project.role || project.role === profileDraft.role)
        : INTERVIEW_PROJECTS;

    return (
        <section className="max-w-3xl space-y-6" aria-labelledby="interview-answer-settings-title">
            <div>
                <h2 id="interview-answer-settings-title" className="text-xl font-semibold text-text-primary">面试回答</h2>
                <p className="mt-2 text-sm text-text-secondary">设置本场面试范围与回答偏好。修改面试配置会取消旧范围下待生成的回答；仅修改补充提示词时，下一道问题生效。</p>
            </div>
            <div className="rounded-xl border border-border-subtle bg-bg-item-surface p-5 space-y-4">
                <div>
                    <h3 className="text-sm font-medium text-text-primary">面试配置</h3>
                    <p className="mt-1 text-sm leading-relaxed text-text-secondary">方向决定主讲和资料排序：AI 岗优先 AI 项目，嵌入式岗优先嵌入式项目。其他项目仍保留，可简短辅助提及；问题点名的项目优先。公司、岗位和主讲项目以这里的设置为准，补充提示词保留表达偏好。</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1">
                        <label htmlFor="interview-profile-company" className="block text-sm font-medium text-text-primary">公司</label>
                        <input
                            id="interview-profile-company"
                            type="text"
                            value={profileDraft.company}
                            maxLength={200}
                            onChange={(event) => updateProfile({ company: event.target.value })}
                            placeholder="例如：字节跳动"
                            className="w-full rounded-lg border border-border-subtle bg-bg-input p-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div className="space-y-1">
                        <label htmlFor="interview-profile-position" className="block text-sm font-medium text-text-primary">岗位</label>
                        <input
                            id="interview-profile-position"
                            type="text"
                            value={profileDraft.position}
                            maxLength={200}
                            onChange={(event) => updateProfile({ position: event.target.value })}
                            placeholder="例如：嵌入式软件工程师"
                            className="w-full rounded-lg border border-border-subtle bg-bg-input p-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div className="space-y-1">
                        <label htmlFor="interview-profile-role" className="block text-sm font-medium text-text-primary">方向</label>
                        <select
                            id="interview-profile-role"
                            value={profileDraft.role}
                            onChange={(event) => updateProfile({ role: event.target.value as InterviewRole })}
                            className="w-full rounded-lg border border-border-subtle bg-bg-input p-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            {ROLE_OPTIONS.map((option) => (
                                <option key={option.value || 'none'} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label htmlFor="interview-profile-default-project" className="block text-sm font-medium text-text-primary">主讲项目</label>
                        <select
                            id="interview-profile-default-project"
                            value={profileDraft.defaultProjectId}
                            onChange={(event) => updateProfile({ defaultProjectId: event.target.value })}
                            className="w-full rounded-lg border border-border-subtle bg-bg-input p-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">未指定</option>
                            {visibleProjects.map((project) => (
                                <option key={project.id} value={project.id}>{project.label}</option>
                            ))}
                        </select>
                        <p className="text-xs text-text-tertiary">仅显示当前方向下的项目；切换方向后不匹配的项目会自动清空。</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={extractProfileSuggestion}
                        className="rounded-lg border border-border-subtle px-4 py-2 text-sm text-text-secondary hover:text-text-primary"
                    >
                        从补充提示词提取建议
                    </button>
                    <button
                        type="button"
                        onClick={saveProfile}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
                    >
                        保存面试配置
                    </button>
                </div>
                {suggestionNote && <p role="status" className="text-sm text-text-secondary">{suggestionNote}</p>}
                {profileMessage && <p role="status" className="text-sm text-emerald-500">{profileMessage}</p>}
                {profileError && <p role="alert" className="text-sm text-red-500">{profileError}</p>}
            </div>
            <div className="rounded-xl border border-border-subtle bg-bg-item-surface p-5 space-y-3">
                <label htmlFor="interview-custom-prompt" className="block text-sm font-medium text-text-primary">补充提示词</label>
                <p id="interview-custom-prompt-help" className="text-sm leading-relaxed text-text-secondary">留空使用默认规则。补充要求会与首页选择的回答级别一起使用；仍按当前问题作答，不编造个人经历，回答语言遵循首页中英文设置。</p>
                <textarea
                    id="interview-custom-prompt"
                    aria-describedby="interview-custom-prompt-help"
                    value={draft}
                    maxLength={INTERVIEW_PROMPT_MAX_LENGTH}
                    rows={8}
                    spellCheck={false}
                    onChange={(event) => { setDraft(event.target.value); setMessage(''); setError(''); setSuggestionNote(''); }}
                    placeholder="例如：用学生面试时的日常口语回答。先讲核心理解，少堆术语；难题只讲最有把握的部分，有明确不足时诚实说明，等追问再展开。"
                    className="w-full resize-y rounded-lg border border-border-subtle bg-bg-input p-3 text-sm leading-relaxed text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-text-tertiary">{draft.length} / {INTERVIEW_PROMPT_MAX_LENGTH}</span>
                    <div className="flex gap-3">
                        <button type="button" onClick={() => save('')} className="rounded-lg border border-border-subtle px-4 py-2 text-sm text-text-secondary hover:text-text-primary">恢复默认</button>
                        <button type="button" onClick={() => save(draft)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">保存提示词</button>
                    </div>
                </div>
                {message && <p role="status" className="text-sm text-emerald-500">{message}</p>}
                {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
            </div>
            <p className="text-sm text-text-secondary">提示词与面试配置保存在本机。以后修改这里即可，无需重新打包 App。若想使用学生回答深度，请在首页将“回答级别”设为“学生/应届”。</p>
        </section>
    );
};
