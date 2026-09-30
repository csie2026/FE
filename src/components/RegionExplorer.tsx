import { useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { regions } from '../data/exploreRegions'
import CityMountainList from './CityMountainList'
import GyeonggiMap from './GyeonggiMap'
import './RegionExplorer.css'

const regionOrder = ['north', 'east', 'south', 'central']
const orderedRegions = regionOrder.map(id => regions.find(region => region.id === id)!)

export default function RegionExplorer() {
  const [active, setActive] = useState(0)
  const [selectedCity, setSelectedCity] = useState<string | null>(null)
  const gesture = useRef<{ id: number; x: number; y: number; dx: number; horizontal: boolean } | null>(null)
  const suppressClick = useRef(false)
  const region = orderedRegions[active]
  const city = region.cities.find(item => item.id === selectedCity)

  function changeRegion(index: number) {
    const next = Math.max(0, Math.min(orderedRegions.length - 1, index))
    if (next !== active) {
      setSelectedCity(null)
      setActive(next)
    }
  }

  function selectOnMap(regionId: string, cityId: string) {
    if (regionId !== region.id) changeRegion(regionOrder.indexOf(regionId))
    else setSelectedCity(cityId)
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0) return
    suppressClick.current = false
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, horizontal: false }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current
    if (!current || current.id !== event.pointerId) return
    const dx = event.clientX - current.x
    const dy = event.clientY - current.y
    if (!current.horizontal) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return
      if (Math.abs(dy) > Math.abs(dx)) { gesture.current = null; return }
      current.horizontal = true
      suppressClick.current = true
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    current.dx = dx
  }

  function finishGesture(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    const current = gesture.current
    if (!current || current.id !== event.pointerId) return
    gesture.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    const threshold = Math.min(64, event.currentTarget.clientWidth * 0.18)
    if (!cancelled && current.horizontal && Math.abs(current.dx) >= threshold) changeRegion(active + (current.dx < 0 ? 1 : -1))
  }

  return <>
    <section className="region-explorer" aria-label="경기도 지도에서 지역 선택">
      <div className="region-map-heading"><b>경기도</b><small>지도에서 시·군을 선택하세요</small></div>
      <div className="region-map-gesture" onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={event => finishGesture(event)} onPointerCancel={event => finishGesture(event, true)}
        onLostPointerCapture={event => {
          // Touch starts with implicit capture on the SVG child. Transferring
          // capture to this container must not cancel the ongoing swipe.
          if (event.target === event.currentTarget) gesture.current = null
        }}
        onClickCapture={event => {
          if (suppressClick.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false }
        }}>
        <GyeonggiMap activeRegion={region.id} selectedCity={selectedCity} onSelect={selectOnMap}/>
      </div>
      <div className="region-current">
        <button className="region-arrow" type="button" aria-label="이전 권역" disabled={active === 0} onClick={() => changeRegion(active - 1)}>‹</button>
        <div><b>{region.name}</b><small>{city ? `${city.name} 선택됨` : `${region.cities.length}개 시·군`}</small></div>
        <button className="region-arrow" type="button" aria-label="다음 권역" disabled={active === orderedRegions.length - 1} onClick={() => changeRegion(active + 1)}>›</button>
      </div>
      <div className="region-indicators" aria-label="권역 바로 이동">{orderedRegions.map((item, index) => <button type="button" key={item.id} className={`region-key region-${item.id}`} aria-label={item.name} aria-current={index === active ? 'true' : undefined} onClick={() => changeRegion(index)}><span/>{item.name}</button>)}</div>
      <p className="region-hint">← 좌우로 밀어 권역을 변경하세요 →</p>
      <span className="region-sr-only" aria-live="polite">{region.name}{city ? `, ${city.name} 선택` : ', 시·군을 선택하세요'}</span>
    </section>
    {city && <CityMountainList key={city.id} city={city}/>}
  </>
}
