import type { LocationData } from "../types/location";

export function getCurrentLocation(): Promise<LocationData> {
  if (!window.isSecureContext)
    return Promise.reject(new Error("Location requires HTTPS or localhost."));
  if (!navigator.geolocation)
    return Promise.reject(new Error("This browser does not support location."));
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords, timestamp }) =>
        resolve({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
          altitude: coords.altitude,
          altitudeAccuracy: coords.altitudeAccuracy,
          heading: coords.heading,
          speed: coords.speed,
          timestamp,
        }),
      (error) =>
        reject(
          new Error(
            error.code === 1
              ? "Location permission was denied. Allow location in your browser settings and try again."
              : error.code === 3
                ? "Finding your location timed out. Move to an open area and try again."
                : "Your location is unavailable. Check your device location settings and try again.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}
