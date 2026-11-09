import { useEffect, useState } from 'react';
import type { GpsPoint, LocationStatus } from '../types';
import { gpsReception } from '../services/gpsReception';

// GPS 수신 권한·오류 상태를 기록 로직과 분리하고, 감시 종료 후 콜백이 화면 상태를 바꾸지 않게 한다.
export function useGeolocation(enabled: boolean, onPosition: (point: GpsPoint) => void) {
  const [position, setPosition] = useState<GpsPoint | null>(null);
  const [status, setStatus] = useState<LocationStatus>('IDLE');
  const [attempt, setAttempt] = useState(0);
  const [reception, setReception] = useState<{
    watchStartedAt: number | null;
    lastReceivedAt: number | null;
    now: number;
  }>({ watchStartedAt: null, lastReceivedAt: null, now: 0 });
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
      if (active) {
        setStatus('REQUESTING');
        const now = Date.now();
        setReception({ watchStartedAt: now, lastReceivedAt: null, now });
      }
    });
    const refreshReception = () => {
      if (active) setReception((current) => ({ ...current, now: Date.now() }));
    };
    const timer = window.setInterval(refreshReception, 1000);
    document.addEventListener('visibilitychange', refreshReception);
    const watch = navigator.geolocation.watchPosition(
      (result) => {
        if (!active) return;
        const receivedAt = Date.now();
        setReception((current) => ({ ...current, lastReceivedAt: receivedAt, now: receivedAt }));
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
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshReception);
      navigator.geolocation.clearWatch(watch);
    };
  }, [enabled, attempt, onPosition]);
  return {
    position,
    status,
    reception: gpsReception(reception.watchStartedAt, reception.lastReceivedAt, reception.now),
    retry: () => setAttempt((value) => value + 1),
  };
}
