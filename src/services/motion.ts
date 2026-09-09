import type { MotionMeasurement } from "../types/sensors";
import { withAbort } from "./abort";
type PermissionAPI = { requestPermission?: () => Promise<string> };

export async function measureMotion(
  signal: AbortSignal,
): Promise<MotionMeasurement[]> {
  if (!window.isSecureContext || !("DeviceMotionEvent" in window))
    throw new Error("Motion sensors are unavailable in this browser.");
  const permissionAPIs = [
    window.DeviceMotionEvent,
    window.DeviceOrientationEvent,
  ].filter(Boolean) as PermissionAPI[];
  const permissions = await withAbort(
    Promise.all(
      permissionAPIs.map(
        (api) => api.requestPermission?.() ?? Promise.resolve("granted"),
      ),
    ),
    signal,
  );
  if (permissions.some((p) => p !== "granted"))
    throw new Error(
      "Motion permission was denied. You can still save an observation.",
    );
  if (signal.aborted) throw new Error("Measurement cancelled.");
  return new Promise((resolve, reject) => {
    const samples: MotionMeasurement[] = [];
    let acceleration: DeviceMotionEventAcceleration | null = null;
    let rotation: DeviceMotionEventRotationRate | null = null;
    let orientation: DeviceOrientationEvent | null = null;
    let received = false;
    const motion = (event: DeviceMotionEvent) => {
      acceleration = event.acceleration;
      rotation = event.rotationRate;
      received = true;
    };
    const orient = (event: DeviceOrientationEvent) => {
      orientation = event;
      received = true;
    };
    const cleanup = () => {
      clearInterval(interval);
      clearTimeout(timeout);
      window.removeEventListener("devicemotion", motion);
      window.removeEventListener("deviceorientation", orient);
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(new Error("Measurement cancelled."));
    };
    window.addEventListener("devicemotion", motion);
    window.addEventListener("deviceorientation", orient);
    signal.addEventListener("abort", abort, { once: true });
    const interval = setInterval(() => {
      if (!received) return;
      received = false;
      const sample: MotionMeasurement = {
        accelerationX: acceleration?.x ?? null,
        accelerationY: acceleration?.y ?? null,
        accelerationZ: acceleration?.z ?? null,
        rotationAlpha: rotation?.alpha ?? null,
        rotationBeta: rotation?.beta ?? null,
        rotationGamma: rotation?.gamma ?? null,
        orientationAlpha: orientation?.alpha ?? null,
        orientationBeta: orientation?.beta ?? null,
        orientationGamma: orientation?.gamma ?? null,
        timestamp: Date.now(),
      };
      if (
        Object.entries(sample).some(
          ([key, value]) => key !== "timestamp" && value !== null,
        )
      )
        samples.push(sample);
    }, 100);
    const timeout = setTimeout(() => {
      cleanup();
      if (samples.length) resolve(samples);
      else
        reject(
          new Error(
            "No motion readings received. This device may not have supported sensors.",
          ),
        );
    }, 10000);
  });
}
