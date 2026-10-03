import { geoMercator, geoPath } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import mapData from '../../data/gyeonggi-si-gun.json';
import type { Mountain, MountainRegion, RegionFilter } from './InteractiveMountainMap';

interface DistrictProperties extends Record<string, unknown> {
  CTPRVN_CD: string;
  SIG_CD: string;
  SIG_KOR_NM: string;
  FULL_NM: string;
}

type DistrictFeature = Feature<Geometry, DistrictProperties>;

interface GyeonggiGeoMapProps {
  region: RegionFilter;
  cities: string[];
  regionByCity: Record<string, MountainRegion>;
  mountains: Mountain[];
  selectedMountain: Mountain | null;
  onRegionSelect: (region: MountainRegion) => void;
  onMountainSelect: (mountain: Mountain) => void;
  onMountainHover: (mountain: Mountain | null) => void;
}

const width = 500;
const height = 550;
const geoJson = mapData as unknown as FeatureCollection<Geometry, DistrictProperties>;
const features = geoJson.features.filter(
  (feature) => feature.properties.CTPRVN_CD === '41' && feature.properties.SIG_CD.startsWith('41'),
);
const gyeonggi: FeatureCollection<Geometry, DistrictProperties> = {
  type: 'FeatureCollection',
  features,
};
const projection = geoMercator().fitSize([width, height], gyeonggi);
const path = geoPath(projection);
const cityName = (feature: DistrictFeature) => feature.properties.SIG_KOR_NM.split(' ')[0];
const project = (lat: number, lng: number) => {
  const point = projection([lng, lat]);
  return point ? { x: point[0], y: point[1] } : { x: 0, y: 0 };
};

export default function GyeonggiGeoMap({
  region,
  cities,
  regionByCity,
  mountains,
  selectedMountain,
  onRegionSelect,
  onMountainSelect,
  onMountainHover,
}: GyeonggiGeoMapProps) {
  const seoul = project(37.5665, 126.978);

  return (
    <svg
      className="interactive-map__svg"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="경기도 31개 시·군 권역 지도와 산 위치"
    >
      <defs>
        <filter id="regionHoverShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#20372b" floodOpacity=".3" />
        </filter>
      </defs>
      <rect width={width} height={height} rx="22" fill="#f3f8fc" />
      <g aria-label="경기도 행정구역 베이스맵">
        {features.map((feature) => (
          <path
            key={`base-${feature.properties.SIG_CD}`}
            d={path(feature) ?? ''}
            className="interactive-map__basemap-land"
          />
        ))}
      </g>
      <g strokeLinejoin="round" className="interactive-map__regions">
        {features.map((feature) => {
          const city = cityName(feature);
          const cityRegion = regionByCity[city];
          if (!cityRegion) return null;
          return (
            <path
              key={feature.properties.SIG_CD}
              d={path(feature) ?? ''}
              className={`map-region map-region--${cityRegion.toLowerCase()} ${
                region === cityRegion ? 'is-selected' : ''
              } ${cities.includes(city) ? 'is-city-selected' : ''}`}
              onClick={() => onRegionSelect(cityRegion)}
              role="button"
              tabIndex={0}
              aria-label={`${city} ${cityRegion} 권역 선택`}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onRegionSelect(cityRegion);
                }
              }}
            />
          );
        })}
      </g>
      <circle cx={seoul.x} cy={seoul.y} r="28" className="interactive-map__seoul" />
      <text
        x={seoul.x}
        y={seoul.y + 4}
        textAnchor="middle"
        className="interactive-map__seoul-label"
      >
        서울
      </text>
      <g className="interactive-map__mountain-markers">
        {mountains.map((mountain) => {
          const { x, y } = project(mountain.lat, mountain.lng);
          return (
            <g
              key={mountain.id}
              className={`mountain-marker ${selectedMountain?.id === mountain.id ? 'is-selected' : ''}`}
              transform={`translate(${x} ${y})`}
              role="button"
              tabIndex={0}
              aria-label={`${mountain.name} ${mountain.height}미터`}
              onClick={(event) => {
                event.stopPropagation();
                onMountainSelect(mountain);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onMountainSelect(mountain);
                }
              }}
              onMouseEnter={() => onMountainHover(mountain)}
              onMouseLeave={() => onMountainHover(null)}
              onFocus={() => onMountainHover(mountain)}
              onBlur={() => onMountainHover(null)}
            >
              <circle className="mountain-marker__pulse" r="15" />
              <circle className="mountain-marker__dot" r="8" />
              <text className="mountain-marker__symbol" textAnchor="middle" y="3">
                ▲
              </text>
              <text x="11" y="4">
                {mountain.name}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
