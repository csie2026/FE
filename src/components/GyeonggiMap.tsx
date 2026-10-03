import { geoMercator, geoPath } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import mapData from '../data/gyeonggi-si-gun.json';
import { regions } from '../data/exploreRegions';

interface DistrictProperties extends Record<string, unknown> {
  CTPRVN_CD: string;
  SIG_CD: string;
  SIG_KOR_NM: string;
}

type District = Feature<Geometry, DistrictProperties>;

const allFeatures = (mapData as unknown as FeatureCollection<Geometry, DistrictProperties>)
  .features;
const gyeonggiFeatures = allFeatures.filter(
  (feature) => feature.properties.CTPRVN_CD === '41' && feature.properties.SIG_CD.startsWith('41'),
);
const cityOf = (feature: District) => feature.properties.SIG_KOR_NM.split(' ')[0];

type Props = {
  activeRegion: string;
  selectedCity: string | null;
  onSelect: (regionId: string, cityId: string) => void;
};

export default function GyeonggiMap({ activeRegion, selectedCity, onSelect }: Props) {
  const region = regions.find((item) => item.id === activeRegion);
  const cityIds = new Set(region?.cities.map((city) => city.id) ?? []);
  const features = gyeonggiFeatures.filter((feature) => cityIds.has(cityOf(feature)));
  const collection: FeatureCollection<Geometry, DistrictProperties> = {
    type: 'FeatureCollection',
    features,
  };
  const projection = geoMercator().fitSize([360, 320], collection);
  const path = geoPath(projection);
  const cityGroups =
    region?.cities.map((city) => {
      const cityFeatures = features.filter((feature) => cityOf(feature) === city.id);
      const centroids = cityFeatures.map((feature) => path.centroid(feature));
      const center = centroids.length
        ? centroids
            .reduce(([sumX, sumY], [x, y]) => [sumX + x, sumY + y], [0, 0])
            .map((value) => value / centroids.length)
        : [0, 0];
      return { city, features: cityFeatures, center };
    }) ?? [];

  return (
    <svg
      className={`gyeonggi-map region-map-${activeRegion}`}
      viewBox="0 0 400 350"
      role="img"
      aria-label={`${region?.name ?? '경기도'} 행정구역 지도`}
    >
      <defs>
        <filter id="map-soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#2d4b39" floodOpacity=".13" />
        </filter>
      </defs>
      <rect x="0" y="0" width="400" height="350" rx="22" fill="#f5f7f2" />
      <g transform="translate(20 15)">
        <g className="focused-region-shapes" filter="url(#map-soft-shadow)">
          {cityGroups.flatMap(({ city, features: cityFeatures }) =>
            cityFeatures.map((feature) => (
              <path
                key={feature.properties.SIG_CD}
                className={`map-city-fill${selectedCity === city.id ? ' is-selected' : ''}`}
                d={path(feature) ?? ''}
                onClick={() => onSelect(activeRegion, city.id)}
                role="button"
                tabIndex={0}
                aria-label={`${city.name} 선택`}
                aria-pressed={selectedCity === city.id}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(activeRegion, city.id);
                  }
                }}
              />
            )),
          )}
        </g>
        <g className="focused-region-labels" pointerEvents="none">
          {cityGroups.map(({ city, center }) => (
            <text
              key={city.id}
              x={center[0]}
              y={center[1]}
              textAnchor="middle"
              dominantBaseline="central"
              className={selectedCity === city.id ? 'is-selected' : ''}
            >
              {city.name.replace(/(시|군)$/, '')}
            </text>
          ))}
        </g>
      </g>
    </svg>
  );
}
