// Audio Worker
// Runs in a Web Worker to handle audio processing off the main thread
import { floatTo16BitPCM, pcm16ToFloat32, resampleAudio, calculateAudioLevel } from './audio-utils.js';
// Target sample rate (set by server based on provider)
let targetSampleRate = 16000;
// Browser audio context typically runs at 44100 or 48000 Hz
const BROWSER_SAMPLE_RATE = 48000;
// Handle incoming messages
self.onmessage = (event) => {
    const message = event.data;
    switch (message.type) {
        case 'configure':
            targetSampleRate = message.sampleRate;
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
function encodeAudio(samples) {
    // Resample to target rate
    const resampled = resampleAudio(samples, BROWSER_SAMPLE_RATE, targetSampleRate);
    // Calculate audio level before encoding
    const level = calculateAudioLevel(resampled);
    // Convert to 16-bit PCM
    const pcm = floatTo16BitPCM(resampled);
    // Copy to new ArrayBuffer to ensure it's transferable
    const buffer = new ArrayBuffer(pcm.byteLength);
    new Int16Array(buffer).set(pcm);
    // Send back to main thread
    const response = {
        type: 'encoded',
        pcmData: buffer,
        level,
    };
    self.postMessage(response);
}
// Decode PCM from server to Float32 for playback
function decodeAudio(pcmData) {
    // Convert PCM to Int16Array
    const pcm = new Int16Array(pcmData);
    // Convert to Float32
    const float32 = pcm16ToFloat32(pcm);
    // Resample from server rate (24kHz output) to browser rate
    const resampled = resampleAudio(float32, 24000, BROWSER_SAMPLE_RATE);
    // Create copy of samples to ensure clean transfer
    const result = new Float32Array(resampled.length);
    result.set(resampled);
    // Send back to main thread
    const response = {
        type: 'decoded',
        samples: result,
    };
    self.postMessage(response);
}
//# sourceMappingURL=audio.worker.js.map