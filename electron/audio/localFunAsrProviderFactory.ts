import { CaptureAudioTimeline } from './CaptureAudioTimeline';
import {
    LocalFunAsrSTT,
    type LocalFunAsrRequestTransport,
    type LocalFunAsrSTTOptions,
} from './LocalFunAsrSTT';

export interface LocalFunAsrProviderPairConfig {
    requestTranscription?: LocalFunAsrRequestTransport;
}

interface CaptureTimelineSession {
    beginSession(generation: number, originMonotonicMs: number): void;
}

interface CaptureSessionProvider {
    beginCaptureSession(generation: number, originMonotonicMs: number): void;
}

export interface LocalFunAsrProviderPairDependencies {
    createTimeline?: () => CaptureTimelineSession;
    createProvider?: (options: LocalFunAsrSTTOptions) => CaptureSessionProvider;
}

export interface LocalFunAsrProviderPair {
    interviewer: LocalFunAsrSTT;
    user: LocalFunAsrSTT;
    beginSession(generation: number, originMonotonicMs: number): void;
}

export function createLocalFunAsrProviderPair(
    config: LocalFunAsrProviderPairConfig = {},
    dependencies: LocalFunAsrProviderPairDependencies = {},
): LocalFunAsrProviderPair {
    const timeline = (dependencies.createTimeline ?? (() => new CaptureAudioTimeline()))();
    const createProvider = dependencies.createProvider ?? (options => new LocalFunAsrSTT(options));
    const common = {
        timeline: timeline as CaptureAudioTimeline,
        ...(config.requestTranscription ? { requestTranscription: config.requestTranscription } : {}),
    };
    const interviewer = createProvider({ ...common, channel: 'interviewer' });
    const user = createProvider({ ...common, channel: 'user' });
    return {
        interviewer: interviewer as LocalFunAsrSTT,
        user: user as LocalFunAsrSTT,
        beginSession(generation, originMonotonicMs) {
            timeline.beginSession(generation, originMonotonicMs);
            interviewer.beginCaptureSession(generation, originMonotonicMs);
            user.beginCaptureSession(generation, originMonotonicMs);
        },
    };
}
