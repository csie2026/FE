import { useEffect, useMemo, useState } from 'react';
import type { MountainWeather as Forecast } from '../api';
import {
  forecastTime,
  loadMountainWeather,
  precipitationText,
  skyText,
  weatherError,
  weatherValue,
} from '../services/mountainWeather';
import './MountainWeather.css';

export default function MountainWeather({ mountainId }: { mountainId: string | number }) {
  const [attempt, setAttempt] = useState(0);
  const request = useMemo(() => ({ id: Number(mountainId), attempt }), [mountainId, attempt]);
  const [result, setResult] = useState<{
    request: typeof request;
    data?: Forecast;
    error?: string;
  } | null>(null);
  useEffect(() => {
    let active = true;
    loadMountainWeather(request.id).then(
      (data) => {
        if (active) setResult({ request, data });
      },
      (cause: unknown) => {
        if (active) setResult({ request, error: weatherError(cause) });
      },
    );
    return () => {
      active = false;
    };
  }, [request]);
  const current = result?.request === request ? result : null;
  return (
    <section className="mountain-weather" aria-label="산 날씨 예보">
      <h3>산행 전 날씨 예보</h3>
      {!current ? (
        <p role="status">날씨 예보를 불러오는 중…</p>
      ) : current.error ? (
        <div role="status">
          <p>{current.error}</p>
          <button type="button" onClick={() => setAttempt((v) => v + 1)}>
            날씨 다시 조회
          </button>
          <p className="mountain-weather__note">날씨 조회와 관계없이 산행을 준비할 수 있어요.</p>
        </div>
      ) : (
        current.data && (
          <>
            <p className="mountain-weather__note">
              발표 기준 {forecastTime(current.data.baseTime)} · 한국 시간
            </p>
            {current.data.days?.length ? (
              current.data.days.map(
                (day, index) =>
                  day && (
                    <details key={`${day.date}-${index}`} open={index === 0 ? true : undefined}>
                      <summary>
                        {day.date ?? '날짜 미제공'} ·{' '}
                        {({ GOOD: '좋음', CAUTION: '주의', BAD: '나쁨' } as Record<string, string>)[
                          day.level ?? ''
                        ] ?? '판단 정보 미제공'}
                      </summary>
                      {day.message && <p>{day.message}</p>}
                      {day.notes?.length ? (
                        <ul>
                          {day.notes.map((note, i) => (
                            <li key={i}>{note}</li>
                          ))}
                        </ul>
                      ) : null}
                      {day.hours?.length ? (
                        <div
                          className="mountain-weather__scroll"
                          tabIndex={0}
                          role="region"
                          aria-label={`${day.date} 시간별 예보, 좌우로 스크롤`}
                        >
                          <table>
                            <caption>예보 대상 시각별 날씨 · 한국 시간</caption>
                            <thead>
                              <tr>
                                <th scope="col">대상 시각</th>
                                <th scope="col">기온 / 하늘</th>
                                <th scope="col">강수</th>
                                <th scope="col">바람 / 습도</th>
                              </tr>
                            </thead>
                            <tbody>
                              {day.hours.map(
                                (hour, i) =>
                                  hour && (
                                    <tr key={`${hour.time}-${i}`}>
                                      <th scope="row">{forecastTime(hour.time)}</th>
                                      <td>
                                        {weatherValue(hour.temperature, '℃')}
                                        <br />
                                        {skyText(hour.sky)}
                                      </td>
                                      <td>
                                        {precipitationText(hour.pty)} · 확률{' '}
                                        {weatherValue(hour.pop, '%')}
                                        <br />
                                        강수량 {weatherValue(hour.precipitationMm, 'mm')} · 적설{' '}
                                        {weatherValue(hour.snowCm, 'cm')}
                                      </td>
                                      <td>
                                        {weatherValue(hour.windSpeed, 'm/s')}
                                        <br />
                                        {weatherValue(hour.humidity, '%')}
                                      </td>
                                    </tr>
                                  ),
                              )}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p>시간별 예보가 없어요.</p>
                      )}
                    </details>
                  ),
              )
            ) : (
              <p role="status">조회 가능한 산행 시간대(06~18시) 예보가 없어요.</p>
            )}
            <p className="mountain-weather__note">
              출처: {current.data.source || '기상청 단기예보'} · 실시간 관측이 아닌 예보이며, 산악
              현장 날씨와 다를 수 있어요.
            </p>
          </>
        )
      )}
    </section>
  );
}
