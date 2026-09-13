import type { LocationData } from "../types/location";

function requestPosition(
  options: PositionOptions,
): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function locationError(error: GeolocationPositionError): Error {
  return new Error(
    error.code === 1
      ? "Standortfreigabe wurde verweigert."
      : error.code === 3
        ? "Standortsuche hat zu lange gedauert."
        : "Standort ist vorübergehend nicht verfügbar.",
  );
}

export async function getCurrentLocation(): Promise<LocationData> {
  if (!window.isSecureContext)
    throw new Error("Standort benötigt HTTPS oder localhost.");
  if (!navigator.geolocation)
    throw new Error("Dieser Browser unterstützt keinen Standort.");

  let position: GeolocationPosition;
  try {
    position = await requestPosition({
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  } catch (cause) {
    const error = cause as GeolocationPositionError;
    if (error.code !== 2) throw locationError(error);

    // CoreLocation can temporarily fail to produce a high-accuracy fix on
    // desktop devices. A recent or network-derived position is still useful.
    try {
      position = await requestPosition({
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000,
      });
    } catch (fallbackCause) {
      throw locationError(fallbackCause as GeolocationPositionError);
    }
  }

  const { coords, timestamp } = position;
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy,
    altitude: coords.altitude,
    altitudeAccuracy: coords.altitudeAccuracy,
    heading: coords.heading,
    speed: coords.speed,
    timestamp,
  };
}
