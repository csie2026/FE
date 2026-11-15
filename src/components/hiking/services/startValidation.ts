import { distanceMeters, isUsablePoint } from '../trackUtils.ts';
import type { Coordinate, GpsPoint } from '../types.ts';
import type { BackgroundLocationPlugin } from '../../../native/backgroundLocation.ts';

export const START_RADIUS_METERS = 50;
export const START_LOCATION_TIMEOUT_MS = 15_000;

export function validateStartPosition(
  start: Coordinate,
  point: GpsPoint,
  requestedAt: number,
  now = Date.now(),
) {
  if (
    !start ||
    !Number.isFinite(start.lat) ||
    Math.abs(start.lat) > 90 ||
    !Number.isFinite(start.lng) ||
    Math.abs(start.lng) > 180
  )
    throw new Error('등산로 출발점 좌표를 확인할 수 없습니다. 코스를 다시 선택해주세요.');
  if (point && Number.isFinite(point.accuracy) && point.accuracy > 50)
    throw new Error('GPS 위치 정확도가 충분하지 않습니다. 탁 트인 곳에서 다시 확인해주세요.');
  if (!point || !isUsablePoint(point, now) || point.timestamp < requestedAt)
    throw new Error('새 GPS 위치를 확인하지 못했습니다. 위치를 다시 확인해주세요.');
  const distance = distanceMeters(point, start);
  if (distance > START_RADIUS_METERS)
    throw new Error(
      `출발점까지 ${distance.toFixed(2)}m입니다. 출발점 50m 이내에서 다시 시작해주세요.`,
    );
}

export function startLocationError(cause: unknown): Error {
  const code = (cause as { code?: unknown } | null)?.code;
  if (code === 1 || code === 'PERMISSION_DENIED' || code === 'PERMISSION_REQUIRED')
    return new Error('위치 권한을 허용한 뒤 다시 시작해주세요.');
  if (code === 3 || code === 'TIMEOUT')
    return new Error('위치 확인 시간이 초과되었습니다. 다시 시도해주세요.');
  return new Error('현재 위치를 확인하지 못했습니다. 위치 서비스를 확인하고 다시 시도해주세요.');
}

// 일반 watchPosition 감시와 독립적이다. 이전 화면 좌표는 입력으로 받지 않는다.
export function acquireWebStartPosition(signal: AbortSignal): Promise<GpsPoint> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Cancelled', 'AbortError'));
      return;
    }
    if (!globalThis.isSecureContext || !navigator.geolocation) {
      reject(startLocationError(null));
      return;
    }
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      action();
    };
    const abort = () => finish(() => reject(new DOMException('Cancelled', 'AbortError')));
    const timer = setTimeout(
      () => finish(() => reject(startLocationError({ code: 3 }))),
      START_LOCATION_TIMEOUT_MS,
    );
    signal.addEventListener('abort', abort, { once: true });
    try {
      navigator.geolocation.getCurrentPosition(
        (result) =>
          finish(() =>
            resolve({
              lat: result.coords.latitude,
              lng: result.coords.longitude,
              latitude: result.coords.latitude,
              longitude: result.coords.longitude,
              accuracy: result.coords.accuracy,
              timestamp: result.timestamp,
              altitude: result.coords.altitude,
              speed: result.coords.speed,
            }),
          ),
        (error) => finish(() => reject(startLocationError(error))),
        { enableHighAccuracy: true, maximumAge: 0, timeout: START_LOCATION_TIMEOUT_MS },
      );
    } catch (cause) {
      finish(() => reject(startLocationError(cause)));
    }
  });
}

export async function acquireNativeStartPosition(
  client: Pick<BackgroundLocationPlugin, 'getStartPosition'>,
  signal: AbortSignal,
): Promise<GpsPoint> {
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  let fix;
  try {
    if (!client.getStartPosition) throw new Error('Missing native location measurement');
    fix = await client.getStartPosition();
  } catch (cause) {
    throw startLocationError(cause);
  }
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  return { ...fix, latitude: fix.lat, longitude: fix.lng, altitude: null, speed: null };
}

// 새 세션 생성만 감싼다. 재개·복구 처리에는 사용하지 않는다.
export function createStartGate() {
  let active: AbortController | null = null;
  return {
    get busy() {
      return active !== null;
    },
    cancel() {
      const previous = active;
      active = null;
      previous?.abort();
    },
    async run(options: {
      startPoint: Coordinate;
      isCurrent: () => boolean;
      acquire: (signal: AbortSignal) => Promise<GpsPoint>;
      commit: () => void;
    }) {
      if (active || !options.isCurrent()) return false;
      const controller = new AbortController();
      active = controller;
      const requestedAt = Date.now();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let abort: (() => void) | undefined;
      try {
        // 네이티브가 응답하지 않아도 검증 대기는 제한 시간 안에 끝낸다.
        const cancelled = new Promise<never>((_, reject) => {
          abort = () => reject(new DOMException('Cancelled', 'AbortError'));
          controller.signal.addEventListener('abort', abort, { once: true });
          timer = setTimeout(
            () => reject(startLocationError({ code: 3 })),
            START_LOCATION_TIMEOUT_MS,
          );
        });
        const point = await Promise.race([options.acquire(controller.signal), cancelled]);
        if (active !== controller || controller.signal.aborted || !options.isCurrent())
          return false;
        validateStartPosition(options.startPoint, point, requestedAt);
        options.commit();
        return true;
      } finally {
        clearTimeout(timer);
        if (abort) controller.signal.removeEventListener('abort', abort);
        if (active === controller) active = null;
        controller.abort();
      }
    },
  };
}
