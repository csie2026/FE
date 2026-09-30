import { lazy, Suspense, useMemo, useState } from 'react'
import './InteractiveMountainMap.css'

const GyeonggiGeoMap = lazy(() => import('./GyeonggiGeoMap'))

export type MountainRegion = 'NORTH' | 'EAST' | 'CENTRAL' | 'SOUTH'

export interface Mountain {
  id: number
  name: string
  region: MountainRegion
  city: string
  height: number
  lat: number
  lng: number
  description: string
}

export type RegionFilter = MountainRegion | 'ALL'

const regionInfo: Record<MountainRegion, { label: string; cities: string[] }> = {
  NORTH: { label: '북부', cities: ['고양시', '의정부시', '파주시', '김포시', '양주시', '포천시', '동두천시', '연천군'] },
  EAST: { label: '동부', cities: ['성남시', '남양주시', '광주시', '하남시', '구리시', '양평군', '가평군'] },
  CENTRAL: { label: '중부', cities: ['수원시', '부천시', '안산시', '화성시', '안양시', '시흥시', '광명시', '군포시', '오산시', '의왕시', '과천시'] },
  SOUTH: { label: '남부', cities: ['용인시', '평택시', '이천시', '안성시', '여주시'] },
}

const regionByCity = Object.fromEntries(
  Object.entries(regionInfo).flatMap(([region, info]) => info.cities.map(city => [city, region])),
) as Record<string, MountainRegion>

export const sampleMountains: Mountain[] = [
  { id: 1, name: '감악산', region: 'NORTH', city: '파주시', height: 675, lat: 37.9405, lng: 126.9536, description: '출렁다리와 임꺽정봉으로 유명한 산입니다.' },
  { id: 2, name: '소요산', region: 'NORTH', city: '동두천시', height: 587, lat: 37.946, lng: 127.087, description: '기암과 계곡, 오래된 사찰이 어우러진 경기 북부 명산입니다.' },
  { id: 3, name: '북한산', region: 'NORTH', city: '고양시', height: 836, lat: 37.6584, lng: 126.977, description: '기암절벽과 탁 트인 전망이 매력적인 경기 북부 대표 산입니다.' },
  { id: 4, name: '운악산', region: 'EAST', city: '포천시', height: 935, lat: 37.8488, lng: 127.3294, description: '경기 5악 가운데 하나로, 웅장한 바위 능선이 펼쳐집니다.' },
  { id: 5, name: '유명산', region: 'EAST', city: '가평군', height: 862, lat: 37.5947, lng: 127.4914, description: '완만한 숲길과 유명계곡이 있어 사계절 사랑받습니다.' },
  { id: 6, name: '용문산', region: 'EAST', city: '양평군', height: 1157, lat: 37.562, lng: 127.55, description: '웅장한 산세와 천년 고찰 용문사가 자리한 양평의 명산입니다.' },
  { id: 7, name: '예봉산', region: 'EAST', city: '남양주시', height: 683, lat: 37.566, lng: 127.243, description: '한강과 팔당호를 내려다보는 전망이 아름답습니다.' },
  { id: 8, name: '검단산', region: 'EAST', city: '하남시', height: 657, lat: 37.524, lng: 127.257, description: '정상에서 한강과 서울 도심을 함께 조망할 수 있습니다.' },
  { id: 9, name: '천마산', region: 'EAST', city: '남양주시', height: 812, lat: 37.679, lng: 127.275, description: '계절마다 다른 숲길 풍경을 만날 수 있는 산입니다.' },
  { id: 10, name: '광교산', region: 'CENTRAL', city: '수원시', height: 582, lat: 37.3481, lng: 127.0319, description: '수원 도심과 호수를 잇는 산책형 등산로가 이어집니다.' },
  { id: 11, name: '수리산', region: 'CENTRAL', city: '군포시', height: 489, lat: 37.365, lng: 126.91, description: '도심 가까이에서 능선 산행과 숲길을 즐길 수 있습니다.' },
  { id: 12, name: '청계산', region: 'CENTRAL', city: '과천시', height: 582, lat: 37.426, lng: 127.043, description: '접근성이 좋고 숲이 울창해 가벼운 산행에 알맞습니다.' },
  { id: 13, name: '칠보산', region: 'CENTRAL', city: '화성시', height: 238, lat: 37.2694, lng: 126.9388, description: '낮은 고도와 편안한 숲길로 가족 산행에 좋습니다.' },
  { id: 14, name: '원적산', region: 'SOUTH', city: '이천시', height: 634, lat: 37.385, lng: 127.43, description: '완만한 능선과 넓은 산자락이 이어지는 이천의 산입니다.' },
  { id: 15, name: '마구산', region: 'SOUTH', city: '용인시', height: 595, lat: 37.205, lng: 127.27, description: '용인에서 즐기기 좋은 숲이 깊은 산입니다.' },
  { id: 16, name: '칠장산', region: 'SOUTH', city: '안성시', height: 492, lat: 37.0427, lng: 127.3912, description: '산사와 숲길이 어우러진 차분한 산행 코스입니다.' },
]

interface InteractiveMountainMapProps {
  mountains?: Mountain[]
  onMountainSelect?: (mountain: Mountain) => void
}

export default function InteractiveMountainMap({ mountains = sampleMountains, onMountainSelect }: InteractiveMountainMapProps) {
  const [region, setRegion] = useState<RegionFilter>('ALL')
  const [cities, setCities] = useState<string[]>([])
  const [selectedMountain, setSelectedMountain] = useState<Mountain | null>(null)
  const [hoveredMountain, setHoveredMountain] = useState<Mountain | null>(null)
  const visibleMountains = useMemo(() => mountains.filter(mountain => (region === 'ALL' || mountain.region === region) && (!cities.length || cities.includes(mountain.city))), [cities, mountains, region])
  const availableCities = region === 'ALL' ? [...new Set(Object.values(regionInfo).flatMap(info => info.cities))] : regionInfo[region].cities

  const selectRegion = (next: RegionFilter) => {
    setRegion(next)
    setCities([])
    setSelectedMountain(null)
  }
  const selectMountain = (mountain: Mountain) => {
    setSelectedMountain(mountain)
    onMountainSelect?.(mountain)
  }
  const toggleCity = (city: string) => {
    const owner = (Object.entries(regionInfo) as [MountainRegion, typeof regionInfo[MountainRegion]][]).find(([, info]) => info.cities.includes(city))?.[0]
    if (region === 'ALL' && owner) {
      setRegion(owner)
      setCities(current => current.includes(city) ? [] : [city])
      return
    }
    setCities(current => current.includes(city) ? current.filter(item => item !== city) : [...current, city])
  }
  return <section className="interactive-map" aria-label="경기도 권역 및 산 탐색">
    <div className="interactive-map__map-wrap">
      {hoveredMountain && <div className="interactive-map__tooltip"><b>{hoveredMountain.name}</b><span>{hoveredMountain.city} · {hoveredMountain.height.toLocaleString()}m</span></div>}
      <Suspense fallback={<div className="interactive-map__loading">경기도 지도를 불러오는 중…</div>}>
        <GyeonggiGeoMap region={region} cities={cities} regionByCity={regionByCity} mountains={visibleMountains} selectedMountain={selectedMountain}
          onRegionSelect={selectRegion} onMountainSelect={selectMountain} onMountainHover={setHoveredMountain} />
      </Suspense>
      <span className="interactive-map__attribution">경계 자료: V-World 행정구역 경계 · 2023</span>
    </div>
    <div className="interactive-map__filters">
      <div className="interactive-map__region-tabs" aria-label="권역 필터">
        {(['ALL', 'NORTH', 'EAST', 'CENTRAL', 'SOUTH'] as RegionFilter[]).map(key => <button key={key} className={region === key ? 'is-active' : ''} onClick={() => selectRegion(key)}>{key === 'ALL' ? '전체' : `${regionInfo[key].label}권역`}</button>)}
      </div>
      <div className="interactive-map__city-title"><b>{region === 'ALL' ? '시·군 전체' : `${regionInfo[region].label}권역 시·군`}</b><span>여러 곳을 선택할 수 있어요</span></div>
      <div className="interactive-map__city-chips">{availableCities.map(city => <button key={city} className={cities.includes(city) ? 'is-active' : ''} onClick={() => toggleCity(city)}>{city}</button>)}</div>
    </div>
    <div className="interactive-map__results">
      <div className="interactive-map__result-heading"><b>산 탐색</b><span>{visibleMountains.length}개</span></div>
      {visibleMountains.map(mountain => <button key={mountain.id} className={`interactive-map__mountain-row ${selectedMountain?.id === mountain.id ? 'is-selected' : ''}`} onClick={() => selectMountain(mountain)}><span className="interactive-map__mountain-icon">△</span><span className="interactive-map__mountain-copy"><b>{mountain.name}</b><small>{mountain.city} · {mountain.height.toLocaleString()}m</small></span><span className="interactive-map__row-arrow">›</span></button>)}
      {!visibleMountains.length && <p className="interactive-map__empty">선택한 조건에 해당하는 산이 없습니다.</p>}
    </div>
    {selectedMountain && <aside className="interactive-map__detail" aria-live="polite"><button className="interactive-map__detail-close" aria-label="상세 닫기" onClick={() => setSelectedMountain(null)}>×</button><span className="interactive-map__detail-eyebrow">{regionInfo[selectedMountain.region].label}권역 · {selectedMountain.city}</span><h3>{selectedMountain.name}</h3><div className="interactive-map__detail-height">▲ <b>{selectedMountain.height.toLocaleString()}</b> m</div><p>{selectedMountain.description}</p></aside>}
  </section>
}

