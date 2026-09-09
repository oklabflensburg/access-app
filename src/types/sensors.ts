export interface NoiseMeasurement {
  averageLevel: number;
  peakLevel: number;
  duration: number;
}
export interface MotionMeasurement {
  accelerationX: number | null;
  accelerationY: number | null;
  accelerationZ: number | null;
  rotationAlpha: number | null;
  rotationBeta: number | null;
  rotationGamma: number | null;
  orientationAlpha: number | null;
  orientationBeta: number | null;
  orientationGamma: number | null;
  timestamp: number;
}
export interface SensorData {
  observationId: string;
  noise?: NoiseMeasurement;
  motion?: MotionMeasurement[];
  light?: { illuminance: number; timestamp: number }[];
}
