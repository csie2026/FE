import { useEffect, useRef, useState } from 'react';
import { loadMapSdk, type KakaoMaps } from './services/mapSdk';
import { courseProgressPath, nearestCoursePosition } from './mapDisplayPath';
import type { GpsPoint, HikingCourse, HikingState } from './types';

type Props = { course: HikingCourse; position: GpsPoint | null; segments: GpsPoint[][]; state: HikingState };
type MapObjects = {
  sdk: KakaoMaps;
  map: InstanceType<KakaoMaps['Map']>;
  marker: InstanceType<KakaoMaps['CustomOverlay']>;
  progress: InstanceType<KakaoMaps['Polyline']>;
};
export default function HikingMap({ course, position, segments, state }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const objects = useRef<MapObjects | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let cleanup = () => {};
    queueMicrotask(() => { if (active) { setReady(false); setError(''); } });
    loadMapSdk().then(sdk => {
      if (!active || !container.current) return;
      const coord = (p: { lat: number; lng: number }) => new sdk.LatLng(p.lat, p.lng);
      const map = new sdk.Map(container.current, { center: coord(course.startPoint), level: 5 });
      const planned = new sdk.Polyline({ map, path: course.path.map(coord), strokeWeight: 6, strokeColor: '#a9cda2', strokeOpacity: 1, strokeStyle: 'solid', zIndex: 1 });
      const progress = new sdk.Polyline({ path: [], strokeWeight: 6, strokeColor: '#285b38', strokeOpacity: 1, strokeStyle: 'solid', zIndex: 3 });
      const start = new sdk.CustomOverlay({ map, position: coord(course.startPoint), content: '<span class="hiking-start-marker" role="img" aria-label="출발점">출발</span>', yAnchor: 1.2, zIndex: 4 });
      const summit = new sdk.CustomOverlay({ map, position: coord(course.summitPoint), content: '<span class="hiking-summit-marker" role="img" aria-label="정상 목적지">⚑ 정상</span>', yAnchor: 1.2, zIndex: 4 });
      const marker = new sdk.CustomOverlay({ position: coord(course.startPoint), content: '<span class="hiking-progress-marker" role="img" aria-label="코스 위 현재 진행 위치"></span>', xAnchor: 0.5, yAnchor: 0.5, zIndex: 5 });
      const bounds = new sdk.LatLngBounds();
      course.path.forEach(p => bounds.extend(coord(p)));
      map.setBounds(bounds);
      const current: MapObjects = { sdk, map, marker, progress };
      objects.current = current;
      const observer = new ResizeObserver(() => map.relayout());
      observer.observe(container.current);
      cleanup = () => {
        observer.disconnect();
        [planned, start, summit, marker, progress].forEach(overlay => overlay.setMap(null));
        objects.current = null;
      };
      setReady(true);
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : '지도 로딩 실패'); });
    return () => { active = false; cleanup(); };
  }, [course, attempt]);
  useEffect(() => {
    const current = objects.current;
    if (!current) return;
    const projection = position && nearestCoursePosition(position, course.path);
    if (!projection) {
      current.marker.setMap(null);
      return;
    }
    const coordinate = new current.sdk.LatLng(projection.coordinate.lat, projection.coordinate.lng);
    current.marker.setPosition(coordinate);
    current.marker.setMap(current.map);
  }, [course, position, ready]);
  useEffect(() => {
    const current = objects.current;
    if (!current) return;
    const displayPath = courseProgressPath(course.path, segments);
    current.progress.setPath(displayPath.map(p => new current.sdk.LatLng(p.lat, p.lng)));
    current.progress.setMap(displayPath.length > 1 ? current.map : null);
  }, [course, segments, ready]);
  return <div className="hiking-map">
    <div ref={container} className="hiking-map-canvas" aria-label="등산 코스와 GPS 경로 지도" />
    {!ready && <div className="hiking-map-message" role="status">
      <strong>{error ? '지도 연결을 확인해주세요' : '지도를 불러오는 중…'}</strong>
      {error && <><p>{error}</p><button type="button" onClick={() => setAttempt(n => n + 1)}>지도 다시 불러오기</button></>}
    </div>}
    {state === 'PAUSED' && <div className="hiking-pause-badge" role="status">Ⅱ 기록 일시정지</div>}
    <button className="hiking-locate" type="button" disabled={!position || !ready} aria-label="현재 위치로 지도 이동" onClick={() => {
      const current = objects.current;
      if (current && position) current.map.panTo(new current.sdk.LatLng(position.lat, position.lng));
    }}>◎</button>
  </div>;
}
