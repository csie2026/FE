import { gyeonggiMap } from '../data/gyeonggiMap'
import { regions } from '../data/exploreRegions'

// Callouts for the dense southwest cluster; boundary paths remain unchanged.
const callouts: Record<string, [number, number]> = {
  부천시: [48, 212], 광명시: [48, 236], 시흥시: [48, 260], 안산시: [48, 284],
  과천시: [365, 244], 안양시: [365, 268], 의왕시: [365, 292],
  군포시: [365, 316], 수원시: [365, 340], 오산시: [365, 364],
}

type Props = { activeRegion: string; selectedCity: string | null; onSelect: (regionId: string, cityId: string) => void }

export default function GyeonggiMap({ activeRegion, selectedCity, onSelect }: Props) {
  return <svg className="gyeonggi-map" viewBox="0 0 400 400" aria-label="경기도 31개 시·군 지도">
    <text className="map-context-label" x="157" y="213" textAnchor="middle">서울</text>
    {gyeonggiMap.map(area => {
      const region = regions.find(item => item.cities.some(city => city.id === area.name))!
      const active = region.id === activeRegion
      const selected = area.name === selectedCity
      return <g key={area.name} className={`map-city region-${region.id}${active ? ' is-active' : ''}${selected ? ' is-selected' : ''}`}
        role="button" tabIndex={0} aria-pressed={selected} aria-label={`${area.name}, ${region.name}${active ? ', 산 목록 보기' : ', 권역 선택'}`}
        onClick={() => onSelect(region.id, area.name)} onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(region.id, area.name) }
        }}>
        <title>{area.name} · {region.name}</title>
        <path className="map-city-fill" d={area.path} fillRule="evenodd"/>
        <path className="map-city-outline" d={area.outline} fill="none"/>
      </g>
    })}
    {/* Labels sit above all paths so adjacent geometry cannot cover their hit targets. */}
    {gyeonggiMap.map(area => {
      const region = regions.find(item => item.cities.some(city => city.id === area.name))!
      if (region.id !== activeRegion) return null
      const external = callouts[area.name]
      const [x, y] = external ?? area.anchor
      const selected = area.name === selectedCity
      return <g key={area.name} className={`map-city-label${external ? ' is-external' : ''}${selected ? ' is-selected' : ''}`} aria-hidden="true" onClick={() => onSelect(region.id, area.name)}>
        {external && <><path className="map-label-line" d={`M${area.anchor[0]},${area.anchor[1]} L${x < 100 ? x + 23 : x - 23},${y}`}/><circle className="map-label-point" cx={area.anchor[0]} cy={area.anchor[1]} r="2"/></>}
        <rect className="map-label-hit" x={x - 24} y={y - 12} width="48" height="24"/>
        <text x={x} y={y} textAnchor="middle" dominantBaseline="central">{area.name}</text>
      </g>
    })}
  </svg>
}
