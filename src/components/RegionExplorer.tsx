import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { regions } from '../data/exploreRegions';
import CityMountainList from './CityMountainList';
import GyeonggiMap from './GyeonggiMap';
import './RegionExplorer.css';

const regionOrder = ['north', 'east', 'south', 'central'];
const orderedRegions = regionOrder.map((id) => regions.find((region) => region.id === id)!);

type Props = {
  favoriteIds: string[];
  onFavoriteToggle: (id: string) => void;
  completedIds: string[];
  onCompletedToggle: (id: string) => void;
};

export default function RegionExplorer({
  favoriteIds,
  onFavoriteToggle,
  completedIds,
  onCompletedToggle,
}: Props) {
  const [active, setActive] = useState(0);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const gesture = useRef<{
    id: number;
    x: number;
    y: number;
    dx: number;
    horizontal: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const region = orderedRegions[active];

  function changeRegion(index: number) {
    const next = Math.max(0, Math.min(orderedRegions.length - 1, index));
    if (next !== active) {
      setSelectedCity(null);
      setActive(next);
    }
  }

  function selectOnMap(regionId: string, cityId: string) {
    if (regionId !== region.id) changeRegion(regionOrder.indexOf(regionId));
    else setSelectedCity(cityId);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    suppressClick.current = false;
    gesture.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      dx: 0,
      horizontal: false,
    };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (!current.horizontal) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        gesture.current = null;
        return;
      }
      current.horizontal = true;
      suppressClick.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    current.dx = dx;
  }

  function finishGesture(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    const threshold = Math.min(64, event.currentTarget.clientWidth * 0.18);
    if (!cancelled && current.horizontal && Math.abs(current.dx) >= threshold)
      changeRegion(active + (current.dx < 0 ? 1 : -1));
  }

  return (
    <>
      <section className="region-explorer" aria-label="경기도 지도에서 지역 선택">
        <div className="region-map-heading">
          <div>
            <small>경기도 권역 탐색</small>
            <b>{region.name}</b>
          </div>
          <span>{String(active + 1).padStart(2, '0')} / 04</span>
        </div>
        <div className="region-map-stage">
          <button
            className="region-arrow"
            type="button"
            aria-label="이전 권역"
            disabled={active === 0}
            onClick={() => changeRegion(active - 1)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="m14 6-6 6 6 6" />
            </svg>
          </button>
          <div
            className="region-map-gesture"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(event) => finishGesture(event)}
            onPointerCancel={(event) => finishGesture(event, true)}
            onLostPointerCapture={(event) => {
              if (event.target === event.currentTarget) gesture.current = null;
            }}
            onClickCapture={(event) => {
              if (suppressClick.current && event.detail !== 0) {
                event.preventDefault();
                event.stopPropagation();
                suppressClick.current = false;
              }
            }}
          >
            <GyeonggiMap
              key={region.id}
              activeRegion={region.id}
              selectedCity={selectedCity}
              onSelect={selectOnMap}
            />
          </div>
          <button
            className="region-arrow"
            type="button"
            aria-label="다음 권역"
            disabled={active === orderedRegions.length - 1}
            onClick={() => changeRegion(active + 1)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="m10 6 6 6-6 6" />
            </svg>
          </button>
        </div>
        <p className="region-selection-caption">
          {selectedCity
            ? `${region.cities.find((item) => item.id === selectedCity)?.name} 선택됨`
            : `${region.cities.length}개 시·군을 둘러보세요`}
        </p>
        <div className="region-indicators" aria-label="권역 바로 이동">
          {orderedRegions.map((item, index) => (
            <button
              type="button"
              key={item.id}
              className={`region-key region-${item.id}`}
              aria-label={item.name}
              aria-current={index === active ? 'true' : undefined}
              onClick={() => changeRegion(index)}
            >
              <span />
              {item.name}
            </button>
          ))}
        </div>
        <p className="region-hint">← 좌우로 밀어 권역을 변경하세요 →</p>
        <span className="region-sr-only" aria-live="polite">
          {region.name}
          {selectedCity
            ? `, ${region.cities.find((item) => item.id === selectedCity)?.name} 선택`
            : ', 시·군을 선택하세요'}
        </span>
      </section>
      <CityMountainList
        cities={region.cities}
        regionName={region.name}
        selectedCity={selectedCity}
        onSelectCity={setSelectedCity}
        favoriteIds={favoriteIds}
        onFavoriteToggle={onFavoriteToggle}
        completedIds={completedIds}
        onCompletedToggle={onCompletedToggle}
      />
    </>
  );
}
