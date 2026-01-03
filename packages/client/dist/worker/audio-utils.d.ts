export declare function floatTo16BitPCM(float32Array: Float32Array): Int16Array;
export declare function pcm16ToFloat32(int16Array: Int16Array): Float32Array;
export declare function resampleAudio(inputSamples: Float32Array, inputRate: number, outputRate: number): Float32Array;
export declare function calculateAudioLevel(samples: Float32Array): number;
//# sourceMappingURL=audio-utils.d.ts.map