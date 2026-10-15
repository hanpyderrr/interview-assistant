import React, { useCallback, useId, useRef, useState } from 'react';
import './ManualQuestionInput.css';

const MAX_LENGTH = 2000;
const SUBMIT_ERROR = '生成失败，请稍后重试；问题已保留，可再次发送。';

export type ManualQuestionInputProps = {
  busy: boolean;
  disabled?: boolean;
  onSubmit: (question: string) => Promise<boolean>;
};

/**
 * Compact text-question composer. Owns only local draft/error/pending state;
 * the root owns LLM generation and session lifecycle through `onSubmit`.
 */
export default function ManualQuestionInput({ busy, disabled = false, onSubmit }: ManualQuestionInputProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submittingRef = useRef(false);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const fieldId = `manual-question-${uid}`;
  const locked = busy || pending || disabled;
  const canSubmit = text.trim().length > 0 && !locked;

  const submit = useCallback(async () => {
    const question = text.trim();
    if (!question || submittingRef.current || busy || disabled) return;
    submittingRef.current = true;
    setPending(true);
    setError(null);
    try {
      const ok = await onSubmit(question);
      // Success keeps the draft so the same question can be resent.
      if (!ok) setError(SUBMIT_ERROR);
    } catch {
      setError(SUBMIT_ERROR);
    } finally {
      submittingRef.current = false;
      setPending(false);
    }
  }, [text, busy, disabled, onSubmit]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(event.metaKey || event.ctrlKey) || event.key !== 'Enter') return;
    const native = event.nativeEvent;
    if (native.isComposing || native.keyCode === 229) return;
    event.preventDefault();
    void submit();
  };

  return (
    <form
      className="manual-question"
      aria-busy={busy || pending}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="manual-question-head">
        <label className="manual-question-label" htmlFor={fieldId}>
          手动输入问题
        </label>
        <span className="manual-question-helper" id={`${fieldId}-helper`}>
          使用当前模型、岗位与提示词生成回答；不会启动音频采集
        </span>
      </div>
      <textarea
        id={fieldId}
        className="manual-question-textarea"
        rows={2}
        maxLength={MAX_LENGTH}
        value={text}
        placeholder="例如：你上学累不累，有什么心得？"
        onChange={(event) => {
          setText(event.target.value);
          setError(null);
        }}
        onKeyDown={handleKeyDown}
        readOnly={locked}
        disabled={disabled}
        aria-describedby={`${fieldId}-helper ${fieldId}-hint ${fieldId}-count`}
        aria-invalid={error ? true : undefined}
      />
      {error ? (
        <p className="manual-question-error" role="status" aria-live="polite">
          {error}
        </p>
      ) : null}
      <div className="manual-question-foot">
        <span className="manual-question-hint" id={`${fieldId}-hint`}>
          Ctrl/⌘ + Enter 生成回答，Enter 换行
        </span>
        <span className="manual-question-count" id={`${fieldId}-count`}>
          {text.length}/{MAX_LENGTH}
        </span>
      </div>
      <button type="submit" className="manual-question-submit" disabled={!canSubmit || pending}>
        {busy || pending ? '生成中…' : '生成回答'}
      </button>
    </form>
  );
}
