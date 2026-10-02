import { useEffect, useState } from 'react';
import type { GpsPoint, LocationStatus } from '../types';

export function useGeolocation(enabled: boolean, onPosition: (point: GpsPoint) => void) {
  const [position, setPosition] = useState<GpsPoint | null>(null);
  const [status, setStatus] = useState<LocationStatus>('IDLE');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    if (!window.isSecureContext || !navigator.geolocation) {
      queueMicrotask(() => {
        if (active) setStatus('UNAVAILABLE');
      });
      return () => {
        active = false;
      };
    }
    queueMicrotask(() => {
      if (active) setStatus('REQUESTING');
    });
    const watch = navigator.geolocation.watchPosition(
      (result) => {
        if (!active) return;
        const point: GpsPoint = {
          lat: result.coords.latitude,
          lng: result.coords.longitude,
          latitude: result.coords.latitude,
          longitude: result.coords.longitude,
          accuracy: result.coords.accuracy,
          timestamp: result.timestamp,
          altitude: result.coords.altitude,
          speed: result.coords.speed,
        };
        setPosition(point);
        setStatus('AVAILABLE');
        onPosition(point);
      },
      (error) => {
        if (active)
          setStatus(error.code === 1 ? 'DENIED' : error.code === 3 ? 'TIMEOUT' : 'UNAVAILABLE');
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
    return () => {
      active = false;
      navigator.geolocation.clearWatch(watch);
    };
  }, [enabled, attempt, onPosition]);
  return { position, status, retry: () => setAttempt((value) => value + 1) };
}
