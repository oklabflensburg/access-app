import type { NoiseMeasurement } from "../types/sensors";
import { withAbort } from "./abort";
import { t } from "../i18n";

export async function measureNoise(
  signal: AbortSignal,
): Promise<NoiseMeasurement> {
  if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext)
    throw new Error(t("errors.noiseUnavailable"));
  const audio = new AudioContext();
  let stream: MediaStream | undefined;
  let interval: ReturnType<typeof setInterval> | undefined;
  const cleanup = () => {
    clearInterval(interval);
    stream?.getTracks().forEach((t) => t.stop());
    if (audio.state !== "closed") void audio.close();
  };
  signal.addEventListener("abort", cleanup, { once: true });
  try {
    await withAbort(audio.resume(), signal);
    stream = await withAbort(
      navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      }),
      signal,
      (late) => late.getTracks().forEach((t) => t.stop()),
    );
    if (signal.aborted) throw new Error(t("errors.measurementCancelled"));
    const source = audio.createMediaStreamSource(stream);
    const analyser = audio.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser); // No destination connection: never play back or record audio.
    const values = new Float32Array(analyser.fftSize);
    const start = performance.now();
    let sum = 0;
    let peak = 0;
    let count = 0;
    return await new Promise((resolve, reject) => {
      const abort = () => reject(new Error(t("errors.measurementCancelled")));
      signal.addEventListener("abort", abort, { once: true });
      interval = setInterval(() => {
        analyser.getFloatTimeDomainData(values);
        let squares = 0;
        for (const value of values) {
          squares += value * value;
          peak = Math.max(peak, Math.abs(value));
        }
        sum += Math.sqrt(squares / values.length);
        count++;
        const duration = (performance.now() - start) / 1000;
        if (duration >= 10) {
          signal.removeEventListener("abort", abort);
          resolve({ averageLevel: sum / count, peakLevel: peak, duration });
        }
      }, 100);
    });
  } finally {
    signal.removeEventListener("abort", cleanup);
    cleanup();
  }
}
