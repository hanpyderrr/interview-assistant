export type AlibabaFunAsrRegion = 'cn-beijing' | 'ap-southeast-1';

export type AlibabaFunAsrModel =
    | 'fun-asr-realtime'
    | 'fun-asr-realtime-2026-02-28';

export const ALIBABA_FUN_ASR_MODELS: readonly AlibabaFunAsrModel[] = Object.freeze([
    'fun-asr-realtime',
    'fun-asr-realtime-2026-02-28',
]);

const DEFAULT_MODEL: AlibabaFunAsrModel = 'fun-asr-realtime';
const REGIONS: readonly AlibabaFunAsrRegion[] = ['cn-beijing', 'ap-southeast-1'];
const WORKSPACE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TASK_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AlibabaRunTaskConfig {
    sampleRate: number;
    model?: AlibabaFunAsrModel;
    languageHint?: string;
    vocabularyId?: string;
}

export type AlibabaContextRole = 'user' | 'assistant';
export type AlibabaContextContentType = 'input_text' | 'text';

export interface AlibabaContextContent {
    type: AlibabaContextContentType;
    text: string;
}

export interface AlibabaContextMessage {
    role: AlibabaContextRole;
    content: readonly AlibabaContextContent[];
}

interface AlibabaMessageHeader<Action extends string> {
    action: Action;
    task_id: string;
    streaming: 'duplex';
}

export interface AlibabaRunTaskMessage {
    header: AlibabaMessageHeader<'run-task'>;
    payload: {
        task_group: 'audio';
        task: 'asr';
        function: 'recognition';
        model: AlibabaFunAsrModel;
        parameters: {
            format: 'pcm';
            sample_rate: number;
            heartbeat: true;
            semantic_punctuation_enabled: false;
            max_sentence_silence: 1300;
            language_hints?: [string];
            vocabulary_id?: string;
        };
        input: Record<string, never>;
    };
}

export interface AlibabaContinueTaskMessage {
    header: AlibabaMessageHeader<'continue-task'>;
    payload: {
        input: {
            context: readonly AlibabaContextMessage[];
        };
    };
}

export interface AlibabaFinishTaskMessage {
    header: AlibabaMessageHeader<'finish-task'>;
    payload: { input: Record<string, never> };
}

export interface AlibabaSentenceWord {
    beginTime: number;
    endTime: number;
    text: string;
    punctuation?: string;
}

export interface AlibabaSentence {
    beginTime: number;
    endTime: number;
    text: string;
    heartbeat: boolean;
    sentenceEnd: boolean;
    sentenceId: number;
    words: AlibabaSentenceWord[];
}

export type AlibabaServerEvent =
    | { type: 'task-started'; taskId: string }
    | { type: 'result-generated'; taskId: string; sentence: AlibabaSentence }
    | { type: 'task-finished'; taskId: string }
    | {
        type: 'task-failed';
        taskId: string;
        errorCode: string;
        errorMessage: string;
    };

export interface AlibabaProtocolError {
    kind: 'alibaba-protocol-error';
    code: 'malformed-message' | 'unknown-event';
    message: string;
}

export type AlibabaServerEventParseResult =
    | { ok: true; event: AlibabaServerEvent }
    | { ok: false; error: AlibabaProtocolError };

export function buildAlibabaEndpoint(workspaceId: string, region: AlibabaFunAsrRegion): string {
    if (!WORKSPACE_ID_PATTERN.test(workspaceId)) {
        throw new TypeError('Invalid Alibaba workspace ID');
    }
    if (!REGIONS.includes(region)) {
        throw new TypeError('Unsupported Alibaba region');
    }
    return `wss://${workspaceId}.${region}.maas.aliyuncs.com/api-ws/v1/inference`;
}

export function buildRunTask(taskId: string, config: AlibabaRunTaskConfig): AlibabaRunTaskMessage {
    assertTaskId(taskId);
    if (!Number.isInteger(config.sampleRate) || config.sampleRate <= 0) {
        throw new TypeError('sampleRate must be a positive integer');
    }

    const model = config.model ?? DEFAULT_MODEL;
    if (!ALIBABA_FUN_ASR_MODELS.includes(model)) {
        throw new TypeError('Unsupported Alibaba Fun-ASR model');
    }
    if (config.languageHint !== undefined) {
        assertNonEmptyString(config.languageHint, 'languageHint');
    }
    if (config.vocabularyId !== undefined) {
        assertNonEmptyString(config.vocabularyId, 'vocabularyId');
    }

    const parameters: AlibabaRunTaskMessage['payload']['parameters'] = {
        format: 'pcm',
        sample_rate: config.sampleRate,
        heartbeat: true,
        semantic_punctuation_enabled: false,
        max_sentence_silence: 1300,
    };
    if (config.languageHint !== undefined) {
        parameters.language_hints = [config.languageHint];
    }
    if (config.vocabularyId !== undefined) {
        parameters.vocabulary_id = config.vocabularyId;
    }

    return {
        header: buildHeader('run-task', taskId),
        payload: {
            task_group: 'audio',
            task: 'asr',
            function: 'recognition',
            model,
            parameters,
            input: {},
        },
    };
}

export function buildContinueTask(
    taskId: string,
    context: readonly AlibabaContextMessage[],
): AlibabaContinueTaskMessage {
    assertTaskId(taskId);
    assertContext(context);
    return {
        header: buildHeader('continue-task', taskId),
        payload: { input: { context } },
    };
}

export function buildFinishTask(taskId: string): AlibabaFinishTaskMessage {
    assertTaskId(taskId);
    return {
        header: buildHeader('finish-task', taskId),
        payload: { input: {} },
    };
}

export function parseAlibabaServerEvent(raw: unknown): AlibabaServerEventParseResult {
    let parsed: unknown = raw;
    if (typeof raw === 'string') {
        try {
            parsed = JSON.parse(raw);
        } catch {
            return protocolError('malformed-message', 'Malformed Alibaba server message');
        }
    }

    if (!isRecord(parsed) || !isRecord(parsed.header)) {
        return protocolError('malformed-message', 'Malformed Alibaba server message');
    }
    const { event, task_id: taskId } = parsed.header;
    if (typeof event !== 'string' || typeof taskId !== 'string' || !TASK_ID_PATTERN.test(taskId)) {
        return protocolError('malformed-message', 'Malformed Alibaba server message');
    }

    switch (event) {
        case 'task-started':
            return { ok: true, event: { type: event, taskId } };
        case 'task-finished':
            return { ok: true, event: { type: event, taskId } };
        case 'task-failed': {
            const errorCode = parsed.header.error_code;
            const errorMessage = parsed.header.error_message;
            if (typeof errorCode !== 'string' || typeof errorMessage !== 'string') {
                return protocolError('malformed-message', 'Malformed Alibaba server message');
            }
            return {
                ok: true,
                event: { type: event, taskId, errorCode, errorMessage },
            };
        }
        case 'result-generated': {
            const sentence = parseSentence(parsed);
            if (sentence === null) {
                return protocolError('malformed-message', 'Malformed Alibaba server message');
            }
            return { ok: true, event: { type: event, taskId, sentence } };
        }
        default:
            return protocolError('unknown-event', 'Unsupported Alibaba server event');
    }
}

export function redactAlibabaError(error: unknown): string {
    let message = error instanceof Error ? error.message : String(error);
    message = message
        .replace(/authorization\s*:\s*[^\r\n]*/giu, 'Authorization: [REDACTED]')
        .replace(/bearer\s+[^\s]+/giu, 'Bearer [REDACTED]')
        .replace(/(https?:\/\/[^\s?]+)\?[^\s]*/giu, '$1?[REDACTED]')
        .replace(/\b(?:sk-[a-z0-9_-]+|fake-[a-z0-9_-]*key)\b/giu, '[REDACTED]')
        .replace(/[\u0000-\u001f\u007f]/gu, ' ')
        .replace(/\s+/gu, ' ')
        .trim();
    return message.slice(0, 240);
}

function buildHeader<Action extends 'run-task' | 'continue-task' | 'finish-task'>(
    action: Action,
    taskId: string,
): AlibabaMessageHeader<Action> {
    return { action, task_id: taskId, streaming: 'duplex' };
}

function assertTaskId(taskId: string): void {
    if (!TASK_ID_PATTERN.test(taskId)) {
        throw new TypeError('Invalid Alibaba task ID');
    }
}

function assertNonEmptyString(value: unknown, name: string): asserts value is string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new TypeError(`${name} must be a non-empty string`);
    }
}

function assertContext(context: unknown): asserts context is readonly AlibabaContextMessage[] {
    if (!Array.isArray(context)) {
        throw new TypeError('context must be an array');
    }
    for (const message of context) {
        if (!isRecord(message) || Object.keys(message).some(key => key !== 'role' && key !== 'content')) {
            throw new TypeError('Invalid context message');
        }
        if (message.role !== 'user' && message.role !== 'assistant') {
            throw new TypeError('Invalid context role');
        }
        if (!Array.isArray(message.content) || message.content.length === 0) {
            throw new TypeError('Context content must be a non-empty array');
        }
        for (const content of message.content) {
            if (!isRecord(content) || Object.keys(content).some(key => key !== 'type' && key !== 'text')) {
                throw new TypeError('Invalid context content');
            }
            if (content.type !== 'input_text' && content.type !== 'text') {
                throw new TypeError('Invalid context content type');
            }
            assertNonEmptyString(content.text, 'context text');
        }
    }
}

function parseSentence(message: Record<string, unknown>): AlibabaSentence | null {
    if (!isRecord(message.payload) || !isRecord(message.payload.output) || !isRecord(message.payload.output.sentence)) {
        return null;
    }
    const sentence = message.payload.output.sentence;
    if (
        !isValidTime(sentence.begin_time)
        || !isValidTime(sentence.end_time)
        || sentence.end_time < sentence.begin_time
        || typeof sentence.text !== 'string'
        || typeof sentence.heartbeat !== 'boolean'
        || typeof sentence.sentence_end !== 'boolean'
        || !Number.isInteger(sentence.sentence_id)
        || (sentence.sentence_id as number) < 0
        || !Array.isArray(sentence.words)
    ) {
        return null;
    }

    const words: AlibabaSentenceWord[] = [];
    for (const rawWord of sentence.words) {
        if (!isRecord(rawWord)) {
            return null;
        }
        const { begin_time: beginTime, end_time: endTime, text, punctuation } = rawWord;
        if (
            !isValidTime(beginTime)
            || !isValidTime(endTime)
            || endTime < beginTime
            || typeof text !== 'string'
            || (punctuation !== undefined && typeof punctuation !== 'string')
        ) {
            return null;
        }
        const word: AlibabaSentenceWord = {
            beginTime,
            endTime,
            text,
        };
        if (typeof punctuation === 'string') {
            word.punctuation = punctuation;
        }
        words.push(word);
    }

    return {
        beginTime: sentence.begin_time,
        endTime: sentence.end_time,
        text: sentence.text,
        heartbeat: sentence.heartbeat,
        sentenceEnd: sentence.sentence_end,
        sentenceId: sentence.sentence_id as number,
        words,
    };
}

function isValidTime(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function protocolError(
    code: AlibabaProtocolError['code'],
    message: string,
): AlibabaServerEventParseResult {
    return {
        ok: false,
        error: { kind: 'alibaba-protocol-error', code, message },
    };
}
