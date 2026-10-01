import { useRef, useState } from 'react';
import type { City, Mountain } from '../data/exploreRegions';
import MountainCard from './MountainCard';

type Props = {
  cities: City[];
  regionName: string;
  selectedCity: string | null;
  onSelectCity: (cityId: string | null) => void;
  favoriteIds: string[];
  onFavoriteToggle: (id: string) => void;
};

export default function CityMountainList({
  cities,
  regionName,
  selectedCity,
  onSelectCity,
  favoriteIds,
  onFavoriteToggle,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [viewed, setViewed] = useState<Mountain | null>(null);
  const [viewedCity, setViewedCity] = useState<City | null>(null);
  const visibleCities = selectedCity ? cities.filter((city) => city.id === selectedCity) : cities;
  const mountainCount = visibleCities.reduce((count, city) => count + city.mountains.length, 0);

  return (
    <section className="city-mountains" aria-labelledby="city-mountains-title">
      <div className="section-heading">
        <b id="city-mountains-title">
          {selectedCity
            ? `${cities.find((city) => city.id === selectedCity)?.name}의 산`
            : `${regionName} 추천 코스`}
        </b>
        <small>{mountainCount}곳</small>
      </div>
      <div className="region-city-filters" aria-label="시·군 산 목록 필터">
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
      <p className="city-mountains-note">산행 정보는 미리보기용 예시입니다.</p>
      {mountainCount ? (
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
                {city.name} · 난이도 {mountain.difficulty}
              </small>
            </MountainCard>
          )),
        )
      ) : (
        <p className="region-hint">아직 등록된 산이 없어요.</p>
      )}
      <dialog
        className="region-mountain-dialog"
        ref={dialog}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
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
                  className={`mountain-dialog-favorite ${favoriteIds.includes(viewed.id) ? 'is-favorite' : ''}`}
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
            <p>{viewedCity.name} · 산행 미리보기</p>
            <div className="stats">
              <div>
                <b>{viewed.height}</b>
                <small>높이</small>
              </div>
              <div>
                <b>{viewed.distance}</b>
                <small>코스 거리</small>
              </div>
              <div>
                <b>{viewed.difficulty}</b>
                <small>난이도</small>
              </div>
            </div>
            <small className="city-mountains-note">실제 산행 정보는 추후 제공됩니다.</small>
          </>
        )}
      </dialog>
    </section>
  );
}
