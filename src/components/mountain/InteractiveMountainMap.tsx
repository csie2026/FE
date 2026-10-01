import { lazy, Suspense, useMemo, useState } from 'react';
import './InteractiveMountainMap.css';
import { sampleMountains } from '../../data/sampleMountains';

const GyeonggiGeoMap = lazy(() => import('./GyeonggiGeoMap'));

export type MountainRegion = 'NORTH' | 'EAST' | 'CENTRAL' | 'SOUTH';

export interface Mountain {
  id: number;
  name: string;
  region: MountainRegion;
  city: string;
  height: number;
  lat: number;
  lng: number;
  description: string;
}

export type RegionFilter = MountainRegion | 'ALL';

const regionInfo: Record<MountainRegion, { label: string; cities: string[] }> = {
  NORTH: {
    label: '북부',
    cities: ['고양시', '의정부시', '파주시', '김포시', '양주시', '포천시', '동두천시', '연천군'],
  },
  EAST: {
    label: '동부',
    cities: ['성남시', '남양주시', '광주시', '하남시', '구리시', '양평군', '가평군'],
  },
  CENTRAL: {
    label: '중부',
    cities: [
      '수원시',
      '부천시',
      '안산시',
      '화성시',
      '안양시',
      '시흥시',
      '광명시',
      '군포시',
      '오산시',
      '의왕시',
      '과천시',
    ],
  },
  SOUTH: { label: '남부', cities: ['용인시', '평택시', '이천시', '안성시', '여주시'] },
};

const regionByCity = Object.fromEntries(
  Object.entries(regionInfo).flatMap(([region, info]) => info.cities.map((city) => [city, region])),
) as Record<string, MountainRegion>;

interface InteractiveMountainMapProps {
  mountains?: Mountain[];
  onMountainSelect?: (mountain: Mountain) => void;
}

export default function InteractiveMountainMap({
  mountains = sampleMountains,
  onMountainSelect,
}: InteractiveMountainMapProps) {
  const [region, setRegion] = useState<RegionFilter>('ALL');
  const [cities, setCities] = useState<string[]>([]);
  const [selectedMountain, setSelectedMountain] = useState<Mountain | null>(null);
  const [hoveredMountain, setHoveredMountain] = useState<Mountain | null>(null);
  const visibleMountains = useMemo(
    () =>
      mountains.filter(
        (mountain) =>
          (region === 'ALL' || mountain.region === region) &&
          (!cities.length || cities.includes(mountain.city)),
      ),
    [cities, mountains, region],
  );
  const availableCities =
    region === 'ALL'
      ? [...new Set(Object.values(regionInfo).flatMap((info) => info.cities))]
      : regionInfo[region].cities;

  const selectRegion = (next: RegionFilter) => {
    setRegion(next);
    setCities([]);
    setSelectedMountain(null);
  };
  const selectMountain = (mountain: Mountain) => {
    setSelectedMountain(mountain);
    onMountainSelect?.(mountain);
  };
  const toggleCity = (city: string) => {
    const owner = (
      Object.entries(regionInfo) as [MountainRegion, (typeof regionInfo)[MountainRegion]][]
    ).find(([, info]) => info.cities.includes(city))?.[0];
    if (region === 'ALL' && owner) {
      setRegion(owner);
      setCities((current) => (current.includes(city) ? [] : [city]));
      return;
    }
    setCities((current) =>
      current.includes(city) ? current.filter((item) => item !== city) : [...current, city],
    );
  };
  return (
    <section className="interactive-map" aria-label="경기도 권역 및 산 탐색">
      <div className="interactive-map__map-wrap">
        {hoveredMountain && (
          <div className="interactive-map__tooltip">
            <b>{hoveredMountain.name}</b>
            <span>
              {hoveredMountain.city} · {hoveredMountain.height.toLocaleString()}m
            </span>
          </div>
        )}
        <Suspense
          fallback={<div className="interactive-map__loading">경기도 지도를 불러오는 중…</div>}
        >
          <GyeonggiGeoMap
            region={region}
            cities={cities}
            regionByCity={regionByCity}
            mountains={visibleMountains}
            selectedMountain={selectedMountain}
            onRegionSelect={selectRegion}
            onMountainSelect={selectMountain}
            onMountainHover={setHoveredMountain}
          />
        </Suspense>
        <span className="interactive-map__attribution">
          경계 자료: V-World 행정구역 경계 · 2023
        </span>
      </div>
      <div className="interactive-map__filters">
        <div className="interactive-map__region-tabs" aria-label="권역 필터">
          {(['ALL', 'NORTH', 'EAST', 'CENTRAL', 'SOUTH'] as RegionFilter[]).map((key) => (
            <button
              key={key}
              className={region === key ? 'is-active' : ''}
              onClick={() => selectRegion(key)}
            >
              {key === 'ALL' ? '전체' : `${regionInfo[key].label}권역`}
            </button>
          ))}
        </div>
        <div className="interactive-map__city-title">
          <b>{region === 'ALL' ? '시·군 전체' : `${regionInfo[region].label}권역 시·군`}</b>
          <span>여러 곳을 선택할 수 있어요</span>
        </div>
        <div className="interactive-map__city-chips">
          {availableCities.map((city) => (
            <button
              key={city}
              className={cities.includes(city) ? 'is-active' : ''}
              onClick={() => toggleCity(city)}
            >
              {city}
            </button>
          ))}
        </div>
      </div>
      <div className="interactive-map__results">
        <div className="interactive-map__result-heading">
          <b>산 탐색</b>
          <span>{visibleMountains.length}개</span>
        </div>
        {visibleMountains.map((mountain) => (
          <button
            key={mountain.id}
            className={`interactive-map__mountain-row ${selectedMountain?.id === mountain.id ? 'is-selected' : ''}`}
            onClick={() => selectMountain(mountain)}
          >
            <span className="interactive-map__mountain-icon">△</span>
            <span className="interactive-map__mountain-copy">
              <b>{mountain.name}</b>
              <small>
                {mountain.city} · {mountain.height.toLocaleString()}m
              </small>
            </span>
            <span className="interactive-map__row-arrow">›</span>
          </button>
        ))}
        {!visibleMountains.length && (
          <p className="interactive-map__empty">선택한 조건에 해당하는 산이 없습니다.</p>
        )}
      </div>
      {selectedMountain && (
        <aside className="interactive-map__detail" aria-live="polite">
          <button
            className="interactive-map__detail-close"
            aria-label="상세 닫기"
            onClick={() => setSelectedMountain(null)}
          >
            ×
          </button>
          <span className="interactive-map__detail-eyebrow">
            {regionInfo[selectedMountain.region].label}권역 · {selectedMountain.city}
          </span>
          <h3>{selectedMountain.name}</h3>
          <div className="interactive-map__detail-height">
            ▲ <b>{selectedMountain.height.toLocaleString()}</b> m
          </div>
          <p>{selectedMountain.description}</p>
        </aside>
      )}
    </section>
  );
}
