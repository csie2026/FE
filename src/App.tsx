import { useState } from 'react'
import './App.css'
import MountainCard, { MountainArt } from './components/MountainCard'
import RegionExplorer from './components/RegionExplorer'

type Screen = 'login' | 'explore' | 'detail' | 'hiking' | 'diary' | 'write' | 'profile' | 'settings' | 'ranking'

const mountains = [
  { name: '천안산', area: '경기도 남양주시 서쪽', height: '812m', distance: '3.8km', time: '2시간 10분', color: 'sage' },
  { name: '운길산', area: '경기도 남양주시 조안면', height: '610m', distance: '2.1km', time: '1시간 25분', color: 'mint' },
  { name: '축령산', area: '경기도 남양주시 수동면', height: '886m', distance: '5.2km', time: '3시간 20분', color: 'olive' },
]

function BrandMark() {
  return <div className="brand-mark" aria-label="ToPeak 로고"><svg viewBox="0 0 160 130" role="img"><path d="M8 119 63 22l18 34 18-48 53 111H8Z" fill="#155b43"/><path d="m36 119 45-70 15 23 19-36 31 83H36Z" fill="#34825e"/><path d="M77 29c-4 15 17 20 7 31-7 8-23 10-26 24-2 11 6 19 17 25" fill="none" stroke="#f8f6e9" strokeWidth="7" strokeLinecap="round"/><path d="m69 105 8 8 4-12" fill="none" stroke="#f8f6e9" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/></svg><strong>ToPeak</strong></div>
}


function App() {
  const [screen, setScreen] = useState<Screen>('login')
  const [selected, setSelected] = useState(0)
  const [started, setStarted] = useState(false)
  const [query, setQuery] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const mountain = mountains[selected]
  const go = (next: Screen) => setScreen(next)

  const header = (title: string, back = false) => <header className="topbar">{back ? <button className="back" onClick={() => go('explore')}>‹ <span>Back</span></button> : <span className="header-spacer" aria-hidden="true"/>}<strong>{title}</strong><button className="icon-button" onClick={() => go('settings')} aria-label="설정">{back ? '☰' : '⋯'}</button></header>
  const tabs = <nav className="tabbar">{([['explore','♧','산 탐색'],['ranking','♜','랭킹'],['diary','▤','등산 일지'],['profile','☻','마이']] as [Screen,string,string][]).map(([id,icon,label]) => <button key={id} className={screen === id || (screen === 'detail' && id === 'explore') || (screen === 'write' && id === 'diary') ? 'active' : ''} onClick={() => go(id)}><span>{icon}</span>{label}</button>)}</nav>
  const card = (index: number, compact = false) => <MountainCard key={mountains[index].name} mountain={mountains[index]} compact={compact} onClick={() => { setSelected(index); go('detail') }}/>

  return <main className="app-shell">
    {screen === 'login' && <section className="login-screen"><div className="login-brand"><BrandMark/><p>기록하고 즐겁게 오르는 방법</p></div><div className="login-actions"><button className="social google" onClick={() => go('explore')}><b>G</b> Google로 시작하기</button><button className="social kakao" onClick={() => go('explore')}><b>●</b> 카카오로 시작하기</button><small>간편하게 시작하고 나만의 산행을 기록해보세요</small></div></section>}

    {screen === 'explore' && <>{header('찾기 탐색')}<div className="scroll-content"><label className="search"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="경기도 이름을 검색해 보세요"/></label><RegionExplorer/><section className="weather"><div><small>남양주</small><b>☀️ 21°</b></div><div className="weather-details">맑음　바람 약함<br/><small>오늘 산행하기 좋은 날이에요</small></div></section><div className="section-heading"><b>산별 추천</b><button>전체 보기</button></div><div className="difficulty"><span>산행 환경</span><i>Easy</i><i>Mid</i><i>Hard</i></div>{mountains.map((_, i) => card(i, true))}</div>{tabs}</>}

    {screen === 'detail' && <>{header('상세', true)}<div className="scroll-content detail-content"><MountainArt/><div className="detail-title"><div><h1>{mountain.name}</h1><small>{mountain.area}</small></div><button className="heart">♡</button></div><div className="stats"><div><b>{mountain.height}</b><small>세로 높지</small></div><div><b>{mountain.distance}</b><small>거리 코스</small></div><div><b>보통</b><small>난이도</small></div></div><h3>다른 사람들의 공개 기록</h3>{card(0,true)}{card(1,true)}<div className="bottom-actions"><button onClick={() => go('diary')}>등산 기록하기</button><button className="primary" onClick={() => { setStarted(true); go('hiking') }}>등산 앱과 연동하기</button></div></div>{tabs}</>}

    {screen === 'hiking' && <>{header('등산 중', true)}<div className="trail-map"><div className="map-pattern dense"/><svg className="trail-line" viewBox="0 0 300 400"><path d="M145 375 C120 330 184 310 156 270 S115 210 160 178 204 134 170 100 160 65 185 28" fill="none" stroke="#155b43" strokeWidth="6" strokeLinecap="round" strokeDasharray="2 3"/></svg><span className="live-pill">Ⅱ 오프라인</span><span className="map-control">◎</span><span className="map-control second">➤</span><span className="trail-start">시작</span></div><div className="hike-panel"><div className="hike-stats"><b>⌁ 520m</b><b>↪ 2.3km</b></div><div className="hike-stats timer"><b>{started ? '00:18:42' : '01:15:20'}</b><b>◴ 2.4km/h</b></div><div className="bottom-actions"><button onClick={() => setStarted(!started)}>{started ? 'Ⅱ 일시정지' : '▶ 계속하기'}</button><button className="primary" onClick={() => go('write')}>■ 등산 완료</button></div></div>{tabs}</>}

    {screen === 'diary' && <>{header('목록', true)}<div className="scroll-content"><h2>내 등산 일지</h2>{[0,1].map((i) => <article className="diary-card" key={i}><MountainArt small/><div><b>{mountains[i].name}</b><small>2026.09.{29-i} 09:30<br/>정상까지 여유롭게 산행</small></div><span className="badge">공개/비공개</span></article>)}<div className="section-heading"><b>기록 목록</b><button onClick={() => go('write')}>기록 작성 ＋</button></div>{mountains.map((_,i) => card(i,true))}</div><div className="bottom-actions fixed"><button onClick={() => go('hiking')}>Ⅱ 일시정지</button><button className="primary" onClick={() => go('write')}>■ 등산 완료</button></div>{tabs}</>}

    {screen === 'write' && <>{header('일지 작성')}<div className="scroll-content form-content"><h2>오늘의 산행을 기록해요</h2><p className="muted">멋있었던 순간을 남겨보세요</p><label>산 선택<select value={selected} onChange={e=>setSelected(Number(e.target.value))}>{mountains.map((m,i)=><option value={i} key={m.name}>{m.name}</option>)}</select></label><label>등산 날짜<input type="date" defaultValue="2026-09-29"/></label><label>제목<input placeholder="산행 제목을 입력하세요"/></label><label>사진<div className="upload">▧<small>사진 업로드</small></div></label><label>오늘의 여정<textarea placeholder="산행에서 느낀 점을 적어주세요" rows={4}/></label><div className="switch-row"><b>공개/비공개</b><button className={`switch ${isPublic?'on':''}`} onClick={()=>setIsPublic(!isPublic)}><span/></button></div><button className="submit" onClick={()=>go('diary')}>기록 저장하기</button></div>{tabs}</>}

    {screen === 'profile' && <>{header('마이페이지')}<div className="scroll-content profile-content"><article className="profile-card"><div className="avatar">☺</div><div><b>닉네임</b><small>이번 겨울 첫 정상에!</small></div><button>›</button></article><div className="profile-stats"><div><b>7회</b><small>기록한 산행</small></div><div><b>24km</b><small>거리 및 횟수</small></div><div><b>19회</b><small>완료 산행</small></div><div><b>325정</b><small>총 고도</small></div></div><h3>내가 정복한 산</h3>{mountains.map((m,i)=><div className="conquered" key={m.name}><span className="tree">♧</span><b>{m.name}</b><small>{3-i}회 정복</small></div>)}<button className="settings-link" onClick={()=>go('settings')}>설정　›</button></div>{tabs}</>}

    {screen === 'settings' && <>{header('설정', true)}<div className="scroll-content settings-content"><h2>계정 설정</h2>{['계정 설정','오프라인 지도 관리','센서 설정','앱 정보'].map(x=><button key={x}>{x}<span>›</span></button>)}</div>{tabs}</>}

    {screen === 'ranking' && <>{header('랭킹')}<div className="scroll-content"><div className="ranking-hero"><span>이번 주 산행 랭킹</span><b>함께 오르는 즐거움</b><div>🥈　🥇　🥉</div></div><h2>이번 주 TOP 등산러</h2>{['산타는곰','초록발자국','바람따라'].map((x,i)=><div className="rank-row" key={x}><strong>{i+1}</strong><span className="avatar">♧</span><b>{x}</b><small>{24-i*5}km</small></div>)}<h3>이달의 추천 산</h3>{mountains.map((_,i)=>card(i,true))}</div>{tabs}</>}
  </main>
}

export default App
