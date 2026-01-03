// Audio Worker
// Runs in a Web Worker to handle audio processing off the main thread

import { floatTo16BitPCM, pcm16ToFloat32, resampleAudio, calculateAudioLevel } from './audio-utils.js';

// Message types for worker communication
interface ConfigureMessage {
    type: 'configure';
    sampleRate: number;
    sourceSampleRate?: number;
}

interface EncodeMessage {
    type: 'encode';
    samples: Float32Array;
}

interface DecodeMessage {
    type: 'decode';
    pcmData: ArrayBuffer;
}

type WorkerMessage = ConfigureMessage | EncodeMessage | DecodeMessage;

interface EncodedResponse {
    type: 'encoded';
    pcmData: ArrayBuffer;
    level: number;
}

interface DecodedResponse {
    type: 'decoded';
    samples: Float32Array;
}

type WorkerResponse = EncodedResponse | DecodedResponse;

// Target sample rate (set by server based on provider)
let targetSampleRate = 16000;

// Browser audio context sample rate (configured by main thread)
let sourceSampleRate = 48000;

// Declare self as DedicatedWorkerGlobalScope
declare const self: DedicatedWorkerGlobalScope;

// Handle incoming messages
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
    const message = event.data;

    switch (message.type) {
        case 'configure':
            targetSampleRate = message.sampleRate;
            if (message.sourceSampleRate) {
                sourceSampleRate = message.sourceSampleRate;
            }
            break;

        case 'encode':
            encodeAudio(message.samples);
            break;

        case 'decode':
            decodeAudio(message.pcmData);
            break;
    }
};

// Encode Float32 audio from browser to PCM for server
function encodeAudio(samples: Float32Array): void {
    // Resample to target rate using actual source rate
    const resampled = resampleAudio(samples, sourceSampleRate, targetSampleRate);

    // Calculate audio level before encoding
    const level = calculateAudioLevel(resampled);

    // Convert to 16-bit PCM
    const pcm = floatTo16BitPCM(resampled);

    // Copy to new ArrayBuffer to ensure it's transferable
    const buffer = new ArrayBuffer(pcm.byteLength);
    new Int16Array(buffer).set(pcm);

    // Send back to main thread
    const response: EncodedResponse = {
        type: 'encoded',
        pcmData: buffer,
        level,
    };
    self.postMessage(response);
}

// Decode PCM from server to Float32 for playback
function decodeAudio(pcmData: ArrayBuffer): void {
    // Convert PCM to Int16Array
    const pcm = new Int16Array(pcmData);

    // Convert to Float32
    const float32 = pcm16ToFloat32(pcm);

    // Resample from server rate (24kHz output) to browser rate
    const resampled = resampleAudio(float32, 24000, sourceSampleRate);

    // Create copy of samples to ensure clean transfer
    const result = new Float32Array(resampled.length);
    result.set(resampled);

    // Send back to main thread
    const response: DecodedResponse = {
        type: 'decoded',
        samples: result,
    };
    self.postMessage(response);
}
