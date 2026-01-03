import * as fs from 'fs';
import * as path from 'path';
import { spawn, spawnSync } from 'child_process';
export class SessionRecorder {
    sessionId;
    directory;
    filenameTemplate;
    filePath;
    fileStream = null;
    ffmpegProcess = null;
    totalSamples = 0;
    isClosed = false;
    useFfmpeg = false;
    // WAV Header constants (for 16-bit PCM, 1 channel, 24kHz)
    SAMPLE_RATE = 24000;
    CHANNELS = 1;
    BIT_DEPTH = 16;
    constructor(sessionId, directory, filenameTemplate = 'session_{id}.wav') {
        this.sessionId = sessionId;
        this.directory = directory;
        this.filenameTemplate = filenameTemplate;
        // Ensure directory exists
        if (!fs.existsSync(directory)) {
            fs.mkdirSync(directory, { recursive: true });
        }
        // Check for ffmpeg
        this.useFfmpeg = this.checkFfmpeg();
        this.filePath = this.generateFilename();
    }
    checkFfmpeg() {
        try {
            const result = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
            return result.status === 0;
        }
        catch {
            return false;
        }
    }
    generateFilename() {
        let filename = this.filenameTemplate;
        // Replace {id}
        filename = filename.replace(/{id}/g, this.sessionId);
        // Replace {timestamp}
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        filename = filename.replace(/{timestamp}/g, timestamp);
        // Replace X with alphanumeric
        filename = filename.replace(/X/g, () => {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            return chars.charAt(Math.floor(Math.random() * chars.length));
        });
        // Replace N with numbers
        filename = filename.replace(/N/g, () => {
            return Math.floor(Math.random() * 10).toString();
        });
        // Ensure extension matches mode
        // Remove existing extension if any
        filename = filename.replace(/\.(wav|mp3|mp4)$/i, '');
        // Append correct extension
        filename += this.useFfmpeg ? '.mp3' : '.wav';
        return path.join(this.directory, filename);
    }
    start() {
        if (this.isClosed)
            return;
        if (this.useFfmpeg) {
            // Start ffmpeg process
            // Input: s16le, 24000Hz, 1 channel, from pipe:0
            // Output: MP3, to this.filePath
            this.ffmpegProcess = spawn('ffmpeg', [
                '-y', // Overwrite
                '-f', 's16le',
                '-ar', this.SAMPLE_RATE.toString(),
                '-ac', this.CHANNELS.toString(),
                '-i', 'pipe:0',
                '-af', 'silenceremove=stop_periods=-1:stop_duration=1:stop_threshold=-50dB,aresample=24000',
                '-f', 'mp3',
                '-b:a', '128k', // 128k MP3
                this.filePath
            ], {
                stdio: ['pipe', 'ignore', 'ignore'] // pipe stdin, ignore stdout/stderr
            });
            this.ffmpegProcess.on('error', (err) => {
                console.error('[SessionRecorder] ffmpeg error:', err);
                // Fallback to WAV not really possible mid-stream effectively without restart
            });
        }
        else {
            console.warn('[SessionRecorder] ffmpeg not found, falling back to WAV recording.');
            // Open file stream for WAV
            this.fileStream = fs.createWriteStream(this.filePath);
            // Write placeholder WAV header (44 bytes)
            const header = Buffer.alloc(44);
            this.fileStream.write(header);
        }
    }
    writeAudio(audio, inputRate) {
        if (this.isClosed)
            return;
        let pcmData;
        // Convert to Int16Array if needed
        if (audio instanceof Buffer) {
            const buf = Buffer.isBuffer(audio) ? audio : Buffer.from(audio);
            pcmData = new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2);
        }
        else if (audio instanceof Float32Array) {
            pcmData = new Int16Array(audio.length);
            for (let i = 0; i < audio.length; i++) {
                const s = Math.max(-1, Math.min(1, audio[i]));
                pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
            }
        }
        else if (audio instanceof Int16Array) {
            pcmData = audio;
        }
        else {
            const buf = Buffer.isBuffer(audio) ? audio : Buffer.from(audio);
            pcmData = new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2);
        }
        // Resample if necessary
        if (inputRate !== this.SAMPLE_RATE) {
            pcmData = this.resample(pcmData, inputRate, this.SAMPLE_RATE);
        }
        const buffer = Buffer.from(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength);
        if (this.useFfmpeg && this.ffmpegProcess?.stdin) {
            // Write to ffmpeg stdin
            // Handle backpressure if needed (for now simple write)
            this.ffmpegProcess.stdin.write(buffer);
        }
        else if (this.fileStream) {
            // Write to WAV file
            this.fileStream.write(buffer);
            this.totalSamples += pcmData.length;
        }
    }
    stop() {
        if (this.isClosed)
            return;
        if (this.useFfmpeg && this.ffmpegProcess) {
            if (this.ffmpegProcess.stdin) {
                this.ffmpegProcess.stdin.end();
            }
            this.ffmpegProcess = null;
        }
        else if (this.fileStream) {
            // Update WAV header
            this.updateHeader();
            this.fileStream.end();
            this.fileStream = null;
        }
        this.isClosed = true;
    }
    resample(input, fromRate, toRate) {
        const ratio = fromRate / toRate;
        const newLength = Math.round(input.length / ratio);
        const output = new Int16Array(newLength);
        for (let i = 0; i < newLength; i++) {
            const index = i * ratio;
            const floor = Math.floor(index);
            const ceil = Math.min(floor + 1, input.length - 1);
            const fraction = index - floor;
            output[i] = input[floor] * (1 - fraction) + input[ceil] * fraction;
        }
        return output;
    }
    updateHeader() {
        try {
            const fd = fs.openSync(this.filePath, 'r+');
            const header = Buffer.alloc(44);
            const dataSize = this.totalSamples * 2;
            const fileSize = 36 + dataSize;
            header.write('RIFF', 0);
            header.writeUInt32LE(fileSize, 4);
            header.write('WAVE', 8);
            header.write('fmt ', 12);
            header.writeUInt32LE(16, 16);
            header.writeUInt16LE(1, 20);
            header.writeUInt16LE(this.CHANNELS, 22);
            header.writeUInt32LE(this.SAMPLE_RATE, 24);
            header.writeUInt32LE(this.SAMPLE_RATE * this.CHANNELS * (this.BIT_DEPTH / 8), 28);
            header.writeUInt16LE(this.CHANNELS * (this.BIT_DEPTH / 8), 32);
            header.writeUInt16LE(this.BIT_DEPTH, 34);
            header.write('data', 36);
            header.writeUInt32LE(dataSize, 40);
            fs.writeSync(fd, header, 0, 44, 0);
            fs.closeSync(fd);
        }
        catch (err) {
            console.error('[SessionRecorder] Failed to update WAV header:', err);
        }
    }
}
//# sourceMappingURL=recorder.js.map