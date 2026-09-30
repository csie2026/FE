import { useRef, useState } from 'react'
import type { City, Mountain } from '../data/exploreRegions'
import MountainCard from './MountainCard'

export default function CityMountainList({ city }: { city: City }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [viewed, setViewed] = useState<Mountain | null>(null)

  return <section className="city-mountains" aria-labelledby="city-mountains-title">
    <div className="section-heading"><b id="city-mountains-title">{city.name}의 산</b><small>{city.mountains.length}곳</small></div>
    <p className="city-mountains-note">산행 정보는 미리보기용 예시입니다.</p>
    {city.mountains.length ? city.mountains.map(mountain => <MountainCard key={mountain.id} mountain={mountain} compact onClick={() => {
      setViewed(mountain)
      dialog.current?.showModal()
    }}><small>난이도 · {mountain.difficulty}</small></MountainCard>) : <p className="region-hint">아직 등록된 산이 없어요.</p>}
    <dialog className="region-mountain-dialog" ref={dialog} onClick={event => {
      if (event.target === event.currentTarget) dialog.current?.close()
    }} aria-labelledby="region-mountain-title">
      {viewed && <><div className="section-heading"><b id="region-mountain-title">{viewed.name}</b><button type="button" onClick={() => dialog.current?.close()}>닫기</button></div>
        <p>{city.name} · 산행 미리보기</p>
        <div className="stats"><div><b>{viewed.height}</b><small>높이</small></div><div><b>{viewed.distance}</b><small>코스 거리</small></div><div><b>{viewed.difficulty}</b><small>난이도</small></div></div>
        <small className="city-mountains-note">실제 산행 정보는 추후 제공됩니다.</small></>}
    </dialog>
  </section>
}
