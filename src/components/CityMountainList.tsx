import type { HikingSelection } from './hiking/services/hikingNavigation';
import { useRef, useState } from 'react';
import type { City, Mountain } from '../data/exploreRegions';
import MountainCard from './MountainCard';
import MountainCourseInfo from './MountainCourseInfo';
import { matchesMountain } from '../services/exploreMountains';

type Props = {
  onSelectCourse: (selection: HikingSelection) => void;
  loading: boolean;
  error: string;
  onRetry: () => void;
  cities: City[];
  regionName: string;
  selectedCity: string | null;
  onSelectCity: (cityId: string | null) => void;
  favoriteIds: string[];
  onFavoriteToggle: (id: string) => void;
};

// 상위 탐색 화면의 시·군 선택과 브라우저에 저장된 산 ID를 받아 목록·상세 모달을 연결한다.
export default function CityMountainList({
  onSelectCourse,
  loading,
  error,
  onRetry,
  cities,
  regionName,
  selectedCity,
  onSelectCity,
  favoriteIds,
  onFavoriteToggle,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const filterDrag = useRef<{
    pointerId: number;
    startX: number;
    scrollLeft: number;
    moved: boolean;
  } | null>(null);
  const suppressFilterClick = useRef(false);
  const [draggingFilters, setDraggingFilters] = useState(false);
  const [query, setQuery] = useState('');
  const [viewed, setViewed] = useState<Mountain | null>(null);
  const [viewedCity, setViewedCity] = useState<City | null>(null);
  const visibleCities = (
    selectedCity ? cities.filter((city) => city.id === selectedCity) : cities
  ).map((city) => ({
    ...city,
    mountains: city.mountains.filter((mountain) => matchesMountain(mountain, query)),
  }));
  const mountainCount = visibleCities.reduce((count, city) => count + city.mountains.length, 0);

  return (
    <section className="city-mountains" aria-labelledby="city-mountains-title">
      <div className="section-heading">
        <b id="city-mountains-title">
          {selectedCity
            ? `${cities.find((city) => city.id === selectedCity)?.name}의 산`
            : `${regionName}의 산`}
        </b>
        <small>{loading || error ? '—' : `${mountainCount}곳`}</small>
      </div>
      <div
        className={`region-city-filters${draggingFilters ? ' is-dragging' : ''}`}
        aria-label="시·군 산 목록 필터, 좌우로 넘겨보세요"
        onPointerDown={(event) => {
          suppressFilterClick.current = false;
          if (event.pointerType !== 'mouse' || event.button !== 0) return;
          filterDrag.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            scrollLeft: event.currentTarget.scrollLeft,
            moved: false,
          };
        }}
        onPointerMove={(event) => {
          const drag = filterDrag.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          const distance = event.clientX - drag.startX;
          if (!drag.moved && Math.abs(distance) < 5) return;
          if (!drag.moved) {
            drag.moved = true;
            suppressFilterClick.current = true;
            setDraggingFilters(true);
            event.currentTarget.setPointerCapture(event.pointerId);
          }
          event.preventDefault();
          event.currentTarget.scrollLeft = drag.scrollLeft - distance;
        }}
        onPointerUp={(event) => {
          filterDrag.current = null;
          setDraggingFilters(false);
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          filterDrag.current = null;
          setDraggingFilters(false);
        }}
        onLostPointerCapture={() => {
          filterDrag.current = null;
          setDraggingFilters(false);
        }}
        onClickCapture={(event) => {
          if (suppressFilterClick.current && event.detail !== 0) {
            event.preventDefault();
            event.stopPropagation();
            suppressFilterClick.current = false;
          }
        }}
      >
        <button
          type="button"
          className={!selectedCity ? 'is-active' : ''}
          onClick={() => onSelectCity(null)}
        >
          전체
        </button>
        {cities.map((city) => (
          <button
            type="button"
            key={city.id}
            className={selectedCity === city.id ? 'is-active' : ''}
            onClick={() => onSelectCity(city.id)}
          >
            {city.name}
          </button>
        ))}
      </div>
      <label className="explore-search">
        산 이름 또는 시·군 검색
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="선택한 권역에서 검색"
        />
      </label>
      <p className="city-mountains-note">거리와 난이도는 산 상세의 등산로별 정보를 확인해주세요.</p>
      {loading ? (
        <p className="region-loading" role="status">
          산 목록을 불러오는 중…
        </p>
      ) : error ? (
        <div className="region-hint" role="alert">
          <p>{error}</p>
          <button type="button" onClick={onRetry}>
            다시 시도
          </button>
        </div>
      ) : mountainCount ? (
        visibleCities.flatMap((city) =>
          city.mountains.map((mountain) => (
            <MountainCard
              key={mountain.id}
              mountain={mountain}
              compact
              isFavorite={favoriteIds.includes(mountain.id)}
              onFavoriteToggle={() => onFavoriteToggle(mountain.id)}
              onClick={() => {
                setViewed(mountain);
                setViewedCity(city);
                dialog.current?.showModal();
              }}
            >
              <small>
                {city.name} · 등산로 {mountain.courseCount}개
              </small>
            </MountainCard>
          )),
        )
      ) : (
        <p className="region-hint">
          {query.trim()
            ? '검색 결과가 없어요. 검색어나 지역 필터를 바꿔보세요.'
            : '아직 등록된 산이 없어요.'}
        </p>
      )}
      <dialog
        className="region-mountain-dialog"
        ref={dialog}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
        onClose={() => {
          setViewed(null);
          setViewedCity(null);
        }}
        aria-labelledby="region-mountain-title"
      >
        {viewed && viewedCity && (
          <>
            <div className="section-heading">
              <b id="region-mountain-title">{viewed.name}</b>
              <div className="mountain-dialog-actions">
                <button
                  type="button"
                  className={`mountain-dialog-favorite ${
                    favoriteIds.includes(viewed.id) ? 'is-favorite' : ''
                  }`}
                  onClick={() => onFavoriteToggle(viewed.id)}
                  aria-pressed={favoriteIds.includes(viewed.id)}
                >
                  {favoriteIds.includes(viewed.id) ? '♥ 찜함' : '♡ 찜하기'}
                </button>
                <button type="button" onClick={() => dialog.current?.close()}>
                  닫기
                </button>
              </div>
            </div>
            <p>{viewedCity.name}</p>
            <div className="stats">
              <div>
                <b>{viewed.height}</b>
                <small>높이</small>
              </div>
            </div>
            {viewed.lat !== null && viewed.lng !== null && (
              <p>
                정상 좌표: {viewed.lat}, {viewed.lng}
              </p>
            )}
            <MountainCourseInfo
              key={viewed.id}
              mountainId={viewed.id}
              onSelectCourse={(selection) => {
                dialog.current?.close();
                onSelectCourse(selection);
              }}
            />
          </>
        )}
      </dialog>
    </section>
  );
}
