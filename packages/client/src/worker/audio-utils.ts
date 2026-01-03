// Audio utilities for PCM encoding/decoding
// Handles conversion between Float32Array (Web Audio) and Int16Array (PCM)

// Convert Float32 samples to 16-bit PCM
export function floatTo16BitPCM(float32Array: Float32Array): Int16Array {
    const int16Array = new Int16Array(float32Array.length);

    for (let i = 0; i < float32Array.length; i++) {
        // Clamp value between -1 and 1
        const sample = Math.max(-1, Math.min(1, float32Array[i]));
        // Convert to 16-bit integer
        int16Array[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }

    return int16Array;
}

// Convert 16-bit PCM to Float32 samples
export function pcm16ToFloat32(int16Array: Int16Array): Float32Array {
    const float32Array = new Float32Array(int16Array.length);

    for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7fff);
    }

    return float32Array;
}

// Resample audio to target sample rate
export function resampleAudio(
    inputSamples: Float32Array,
    inputRate: number,
    outputRate: number
): Float32Array {
    if (inputRate === outputRate) {
        return inputSamples;
    }

    const ratio = inputRate / outputRate;
    const outputLength = Math.ceil(inputSamples.length / ratio);
    const output = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
        const srcIndex = i * ratio;
        const srcIndexFloor = Math.floor(srcIndex);
        const srcIndexCeil = Math.min(srcIndexFloor + 1, inputSamples.length - 1);
        const fraction = srcIndex - srcIndexFloor;

        // Linear interpolation
        output[i] =
            inputSamples[srcIndexFloor] * (1 - fraction) +
            inputSamples[srcIndexCeil] * fraction;
    }

    return output;
}

// Calculate RMS audio level (0-1 range)
export function calculateAudioLevel(samples: Float32Array): number {
    if (samples.length === 0) return 0;

    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
        sum += samples[i] * samples[i];
    }

    return Math.sqrt(sum / samples.length);
}
