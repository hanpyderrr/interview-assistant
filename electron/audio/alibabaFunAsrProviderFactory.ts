import {
    validateAlibabaFunAsrPublicConfig,
    type AlibabaFunAsrPublicConfigInput,
} from './alibabaFunAsrConnectionTest';
import {
    AlibabaFunAsrStreamingSTT,
    type AlibabaFunAsrStreamingSTTOptions,
} from './AlibabaFunAsrStreamingSTT';
import { CaptureAudioTimeline } from './CaptureAudioTimeline';

export interface AlibabaFunAsrProviderPairConfig extends AlibabaFunAsrPublicConfigInput {
    apiKey: string;
}

interface CaptureTimelineSession {
    beginSession(generation: number, originMonotonicMs: number): void;
}

interface CaptureSessionProvider {
    beginCaptureSession(generation: number, originMonotonicMs: number): void;
}

export interface AlibabaFunAsrProviderPairDependencies {
    createTimeline?: () => CaptureTimelineSession;
    createProvider?: (options: AlibabaFunAsrStreamingSTTOptions) => CaptureSessionProvider;
}

export interface AlibabaFunAsrProviderPair {
    interviewer: AlibabaFunAsrStreamingSTT;
    user: AlibabaFunAsrStreamingSTT;
    beginSession(generation: number, originMonotonicMs: number): void;
}

export function createAlibabaFunAsrProviderPair(
    input: AlibabaFunAsrProviderPairConfig,
    dependencies: AlibabaFunAsrProviderPairDependencies = {},
): AlibabaFunAsrProviderPair {
    const config = validateAlibabaFunAsrPublicConfig(input);
    if (typeof input.apiKey !== 'string' || input.apiKey.trim().length === 0) {
        throw new TypeError('Alibaba API key is required');
    }

    const timeline = (dependencies.createTimeline ?? (() => new CaptureAudioTimeline()))();
    const createProvider = dependencies.createProvider
        ?? (options => new AlibabaFunAsrStreamingSTT(options));
    const commonOptions = {
        apiKey: input.apiKey.trim(),
        region: config.region,
        model: config.model,
        workspaceId: config.workspaceId,
        vocabularyId: config.vocabularyId,
        timeline: timeline as CaptureAudioTimeline,
    };
    const interviewer = createProvider({ ...commonOptions, channel: 'interviewer' });
    const user = createProvider({ ...commonOptions, channel: 'user' });

    return {
        interviewer: interviewer as AlibabaFunAsrStreamingSTT,
        user: user as AlibabaFunAsrStreamingSTT,
        beginSession(generation, originMonotonicMs) {
            timeline.beginSession(generation, originMonotonicMs);
            interviewer.beginCaptureSession(generation, originMonotonicMs);
            user.beginCaptureSession(generation, originMonotonicMs);
        },
    };
}
