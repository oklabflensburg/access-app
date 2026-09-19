import { t } from "../i18n";

type Reading = { illuminance: number; timestamp: number };
interface LightSensor extends EventTarget {
  illuminance: number | null;
  start(): void;
  stop(): void;
}
export function measureLight(signal: AbortSignal): Promise<Reading[]> {
  const API = (
    window as unknown as {
      AmbientLightSensor?: new (options: { frequency: number }) => LightSensor;
    }
  ).AmbientLightSensor;
  if (!API)
    return Promise.reject(
      new Error(t("errors.lightUnavailable")),
    );
  return new Promise((resolve, reject) => {
    let sensor: LightSensor;
    try {
      sensor = new API({ frequency: 2 });
    } catch {
      reject(new Error(t("errors.lightUnavailable")));
      return;
    }
    const readings: Reading[] = [];
    const cleanup = () => {
      clearTimeout(timeout);
      sensor.stop();
      sensor.removeEventListener("reading", read);
      sensor.removeEventListener("error", fail);
      signal.removeEventListener("abort", abort);
    };
    const read = () => {
      if (sensor.illuminance !== null && readings.length < 20)
        readings.push({
          illuminance: sensor.illuminance,
          timestamp: Date.now(),
        });
    };
    const fail = () => {
      cleanup();
      reject(new Error(t("errors.lightPermission")));
    };
    const abort = () => {
      cleanup();
      reject(new Error(t("errors.measurementCancelled")));
    };
    const timeout = setTimeout(() => {
      cleanup();
      readings.length
        ? resolve(readings)
        : reject(new Error(t("errors.lightNoValues")));
    }, 5000);
    sensor.addEventListener("reading", read);
    sensor.addEventListener("error", fail);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    try {
      sensor.start();
    } catch {
      fail();
    }
  });
}
