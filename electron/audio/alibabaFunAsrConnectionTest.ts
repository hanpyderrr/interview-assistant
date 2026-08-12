import { randomUUID } from 'crypto';
import {
    ALIBABA_FUN_ASR_MODELS,
    ALIBABA_FUN_ASR_REGIONS,
    buildAlibabaEndpoint,
    buildFinishTask,
    buildRunTask,
    parseAlibabaServerEvent,
    redactAlibabaError,
    type AlibabaFunAsrModel,
    type AlibabaFunAsrRegion,
} from './AlibabaFunAsrProtocol';

type TimerHandle = ReturnType<typeof setTimeout> | unknown;

interface SocketLike {
    readyState?: number;
    on(event: string, listener: (...args: any[]) => void): this;
    removeListener(event: string, listener: (...args: any[]) => void): this;
    send(value: string): void;
    close(): void;
}

interface TimerApi {
    setTimeout(callback: () => void, delayMs: number): TimerHandle;
    clearTimeout(handle: TimerHandle): void;
}

export interface AlibabaFunAsrPublicConfigInput {
    region: AlibabaFunAsrRegion;
    model: AlibabaFunAsrModel;
    workspaceId: string;
    vocabularyId?: string;
}

export interface AlibabaFunAsrConnectionTestOptions extends AlibabaFunAsrPublicConfigInput {
    apiKey: string;
    languageHint?: string;
    wsFactory?: (url: string, options: { headers: Record<string, string> }) => SocketLike;
    uuid?: () => string;
    timers?: TimerApi;
    deadlineMs?: number;
}

export type AlibabaFunAsrConnectionTestResult =
    | { success: true }
    | { success: false; error: string };

const defaultTimers: TimerApi = {
    setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function validateAlibabaFunAsrPublicConfig(input: unknown): AlibabaFunAsrPublicConfigInput {
    if (!isRecord(input)) throw new TypeError('Invalid Alibaba Fun-ASR config');
    const { region, model, workspaceId, vocabularyId } = input;
    if (!ALIBABA_FUN_ASR_REGIONS.includes(region as AlibabaFunAsrRegion)) {
        throw new TypeError('Unsupported Alibaba region');
    }
    if (!ALIBABA_FUN_ASR_MODELS.includes(model as AlibabaFunAsrModel)) {
        throw new TypeError('Unsupported Alibaba Fun-ASR model');
    }
    if (typeof workspaceId !== 'string') throw new TypeError('Invalid Alibaba workspace ID');
    const normalizedWorkspaceId = workspaceId.trim();
    buildAlibabaEndpoint(normalizedWorkspaceId, region as AlibabaFunAsrRegion);
    if (vocabularyId !== undefined && typeof vocabularyId !== 'string') {
        throw new TypeError('Invalid Alibaba vocabulary ID');
    }
    const normalizedVocabularyId = typeof vocabularyId === 'string'
        ? vocabularyId.trim() || undefined
        : undefined;
    return {
        region: region as AlibabaFunAsrRegion,
        model: model as AlibabaFunAsrModel,
        workspaceId: normalizedWorkspaceId,
        vocabularyId: normalizedVocabularyId,
    };
}

export function testAlibabaFunAsrConnection(
    options: AlibabaFunAsrConnectionTestOptions,
): Promise<AlibabaFunAsrConnectionTestResult> {
    const config = validateAlibabaFunAsrPublicConfig(options);
    if (typeof options.apiKey !== 'string' || options.apiKey.trim().length === 0) {
        return Promise.resolve({ success: false, error: 'Alibaba API key is required' });
    }
    const taskId = (options.uuid ?? randomUUID)();
    const endpoint = buildAlibabaEndpoint(config.workspaceId, config.region);
    const runTask = buildRunTask(taskId, {
        sampleRate: 16_000,
        model: config.model,
        vocabularyId: config.vocabularyId,
        languageHint: options.languageHint,
    });
    const timers = options.timers ?? defaultTimers;
    const deadlineMs = options.deadlineMs ?? 10_000;
    const factory = options.wsFactory ?? defaultWsFactory;

    return new Promise(resolve => {
        let settled = false;
        let stage: 'connect' | 'start' | 'finish' = 'connect';
        let deadline: TimerHandle | undefined;
        let socket: SocketLike;

        const swallowCloseError = (): void => {
            // ws emits an asynchronous error when close() aborts CONNECTING.
        };
        const removeCloseGuards = (): void => {
            socket.removeListener('error', swallowCloseError);
            socket.removeListener('close', removeCloseGuards);
        };
        const cleanup = (): void => {
            if (deadline !== undefined) {
                timers.clearTimeout(deadline);
                deadline = undefined;
            }
            socket.removeListener('open', onOpen);
            socket.removeListener('message', onMessage);
            socket.removeListener('unexpected-response', onUnexpectedResponse);
            socket.removeListener('error', onError);
            socket.removeListener('close', onClose);
            socket.on('error', swallowCloseError);
            socket.on('close', removeCloseGuards);
            try {
                socket.close();
                // Injected synchronous sockets do not have a WebSocket readyState
                // or asynchronous close lifecycle, so no guard needs to outlive close().
                if (socket.readyState === undefined || socket.readyState === 3) {
                    removeCloseGuards();
                }
            } catch {
                removeCloseGuards();
            }
        };
        const done = (result: AlibabaFunAsrConnectionTestResult): void => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(result);
        };
        const armDeadline = (nextStage: typeof stage): void => {
            if (deadline !== undefined) timers.clearTimeout(deadline);
            stage = nextStage;
            deadline = timers.setTimeout(() => {
                done({ success: false, error: `Alibaba ${stage} timed out` });
            }, deadlineMs);
        };
        const onOpen = (): void => {
            if (settled || stage !== 'connect') return;
            try {
                socket.send(JSON.stringify(runTask));
                armDeadline('start');
            } catch (error) {
                redactAlibabaError(error);
                done({ success: false, error: 'Connection failed' });
            }
        };
        const onMessage = (raw: unknown): void => {
            if (settled) return;
            const value = Buffer.isBuffer(raw) ? raw.toString('utf8') : raw;
            const parsed = parseAlibabaServerEvent(value);
            if (!parsed.ok) {
                done({ success: false, error: 'Malformed Alibaba protocol message' });
                return;
            }
            if (parsed.event.taskId !== taskId) return;
            if (parsed.event.type === 'task-failed') {
                done({ success: false, error: 'Alibaba task failed' });
                return;
            }
            if (stage === 'start' && parsed.event.type === 'task-started') {
                try {
                    socket.send(JSON.stringify(buildFinishTask(taskId)));
                    armDeadline('finish');
                } catch (error) {
                    redactAlibabaError(error);
                    done({ success: false, error: 'Connection failed' });
                }
                return;
            }
            if (stage === 'finish' && parsed.event.type === 'task-finished') {
                done({ success: true });
            }
        };
        const onUnexpectedResponse = (_request: unknown, response: { statusCode?: number }): void => {
            const status = response?.statusCode;
            if (status === 401 || status === 403) {
                done({ success: false, error: `Alibaba authentication failed (${status})` });
            } else {
                done({ success: false, error: `Alibaba handshake failed${status ? ` (${status})` : ''}` });
            }
        };
        const onError = (error: unknown): void => {
            redactAlibabaError(error);
            done({ success: false, error: 'Connection failed' });
        };
        const onClose = (): void => done({ success: false, error: 'Socket closed before completion' });

        try {
            socket = factory(endpoint, {
                headers: {
                    Authorization: `Bearer ${options.apiKey.trim()}`,
                    'user-agent': 'Natively/AlibabaFunAsrConnectionTest',
                },
            });
            socket.on('open', onOpen);
            socket.on('message', onMessage);
            socket.on('unexpected-response', onUnexpectedResponse);
            socket.on('error', onError);
            socket.on('close', onClose);
            armDeadline('connect');
        } catch (error) {
            redactAlibabaError(error);
            resolve({ success: false, error: 'Connection failed' });
        }
    });
}

function defaultWsFactory(url: string, options: { headers: Record<string, string> }): SocketLike {
    const WebSocket = require('ws');
    return new WebSocket(url, options) as SocketLike;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
