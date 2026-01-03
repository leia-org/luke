export declare class SessionRecorder {
    private sessionId;
    private directory;
    private filenameTemplate;
    private filePath;
    private fileStream;
    private ffmpegProcess;
    private totalSamples;
    private isClosed;
    private useFfmpeg;
    private readonly SAMPLE_RATE;
    private readonly CHANNELS;
    private readonly BIT_DEPTH;
    constructor(sessionId: string, directory: string, filenameTemplate?: string);
    private checkFfmpeg;
    private generateFilename;
    start(): void;
    writeAudio(audio: Buffer | Int16Array | Float32Array, inputRate: number): void;
    stop(): void;
    private resample;
    private updateHeader;
}
//# sourceMappingURL=recorder.d.ts.map