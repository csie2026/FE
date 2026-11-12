import { ApiError, getMountainWeather, type MountainWeather } from '../api.ts';

const cache = new Map<number, { expires: number; value: Promise<MountainWeather> }>();
const TTL = 5 * 60 * 1000;
export function loadMountainWeather(mountainId: number): Promise<MountainWeather> {
  if (!Number.isSafeInteger(mountainId) || mountainId <= 0)
    return Promise.reject(new Error('산 ID를 확인해주세요.'));
  const existing = cache.get(mountainId);
  if (existing && existing.expires > Date.now()) return existing.value;
  const value = getMountainWeather(mountainId, AbortSignal.timeout(12_000)).then((data) => {
    if (!data || data.mountainId !== mountainId || (data.days != null && !Array.isArray(data.days)))
      throw new ApiError(200, '날씨 응답을 확인할 수 없습니다.', 'invalid_response');
    return data;
  });
  const entry = { expires: Date.now() + TTL, value };
  cache.delete(mountainId);
  cache.set(mountainId, entry);
  if (cache.size > 40) cache.delete(cache.keys().next().value!);
  void value.catch(() => {
    if (cache.get(mountainId) === entry) cache.delete(mountainId);
  });
  return value;
}

export function weatherError(cause: unknown): string {
  if (cause instanceof ApiError) {
    if (cause.status === 503) return '날씨 서비스가 준비되지 않아 예보를 조회할 수 없어요.';
    if (cause.status === 502) return '기상청 예보를 가져오지 못했어요. 잠시 후 다시 시도해주세요.';
    if (cause.status === 404) return '이 산의 날씨 정보를 찾을 수 없어요.';
    if (cause.status === 401 || cause.status === 403)
      return '날씨를 보려면 로그인 상태를 확인해주세요.';
  }
  return '날씨를 불러오지 못했어요. 연결 상태를 확인하고 다시 시도해주세요.';
}

export function forecastTime(value: string | null | undefined): string {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (!match) return '시각 미제공';
  return `${match[2]}/${match[3]} ${match[4]}:${match[5]}`;
}
export function weatherValue(value: number | null | undefined, unit: string): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value}${unit}` : '미제공';
}
export function skyText(value: number | null | undefined): string {
  return (
    ({ 1: '맑음', 3: '구름많음', 4: '흐림' } as Record<number, string>)[value!] ??
    '하늘 상태 미제공'
  );
}
export function precipitationText(value: number | null | undefined): string {
  return (
    ({ 0: '없음', 1: '비', 2: '비/눈', 3: '눈', 4: '소나기' } as Record<number, string>)[value!] ??
    '미제공'
  );
}
