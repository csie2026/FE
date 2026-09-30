import { useEffect, useState } from 'react'
import './App.css'
import MountainCard, { MountainArt } from './components/MountainCard'
import RegionExplorer from './components/RegionExplorer'
import { api, ApiError, scoreText, type Member, type Journal, type PublicProfile } from './api'

type Screen = 'login' | 'explore' | 'detail' | 'hiking' | 'diary' | 'write' | 'profile' | 'settings' | 'ranking' | 'setup' | 'myJournals' | 'publicProfile'

const mountains = [
  { name: '천안산', area: '경기도 남양주시 서쪽', height: '812m', distance: '3.8km', time: '2시간 10분', color: 'sage' },
  { name: '운길산', area: '경기도 남양주시 조안면', height: '610m', distance: '2.1km', time: '1시간 25분', color: 'mint' },
  { name: '축령산', area: '경기도 남양주시 수동면', height: '886m', distance: '5.2km', time: '3시간 20분', color: 'olive' },
]

function BrandMark() {
  return <div className="brand-mark" aria-label="ToPeak 로고"><svg viewBox="0 0 160 130" role="img"><path d="M8 119 63 22l18 34 18-48 53 111H8Z" fill="#155b43"/><path d="m36 119 45-70 15 23 19-36 31 83H36Z" fill="#34825e"/><path d="M77 29c-4 15 17 20 7 31-7 8-23 10-26 24-2 11 6 19 17 25" fill="none" stroke="#f8f6e9" strokeWidth="7" strokeLinecap="round"/><path d="m69 105 8 8 4-12" fill="none" stroke="#f8f6e9" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/></svg><strong>ToPeak</strong></div>
}


function localDate() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

function App() {
  const [screen, setScreen] = useState<Screen>('login')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [me, setMe] = useState<Member | null>(null)
  const [nickname, setNickname] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [journals, setJournals] = useState<Journal[]>([])
  const [ranking, setRanking] = useState<PublicProfile[]>([])
  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null)
  const [publicId, setPublicId] = useState<number | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [date, setDate] = useState(localDate())
  const [journalMountain, setJournalMountain] = useState('')
  const [selected, setSelected] = useState(0)
  const [started, setStarted] = useState(false)
  const [query, setQuery] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const mountain = mountains[selected]
  const go = (next: Screen) => {
    setError('')
    if (!me) { setScreen('login'); return }
    if (!me.profileCompleted) { setScreen('setup'); return }
    if (next === 'write') { setEditing(null); setTitle(''); setContent(''); setJournalMountain(''); setIsPublic(false) }
    if (next === screen) return
    setBusy(['diary', 'myJournals', 'ranking', 'publicProfile', 'profile'].includes(next)); setJournals([]); setPublicProfile(null)
    setScreen(next)
    if (next !== 'publicProfile' && window.location.hash) window.history.pushState(null, '', window.location.pathname)
  }
  const fail = (e: unknown) => {
    setError(e instanceof Error ? e.message : '요청에 실패했습니다.')
    if (e instanceof ApiError && e.status === 401) { setMe(null); setScreen('login') }
  }
  useEffect(() => {
    let active = true
    api<Member>('/api/users/me').then(user => {
      if (!active) return
      setMe(user); setNickname(user.nickname ?? '')
      const match = window.location.hash.match(/^#users\/(\d+)$/)
      if (!user.profileCompleted) setScreen('setup')
      else if (match) { setBusy(true); setPublicId(Number(match[1])); setScreen('publicProfile') }
      else setScreen('explore')
    }).catch(e => { if (active && (!(e instanceof ApiError) || e.status !== 401)) fail(e) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    const back = () => {
      if (!me) { setScreen('login'); return }
      if (!me.profileCompleted) { setScreen('setup'); return }
      const match = window.location.hash.match(/^#users\/(\d+)$/)
      if (match) {
        const id = Number(match[1])
        if (screen === 'publicProfile' && publicId === id) return
        setBusy(true); setPublicProfile(null); setJournals([]); setPublicId(id); setScreen('publicProfile')
      } else if (screen !== 'ranking') { setBusy(true); setScreen('ranking') }
    }
    window.addEventListener('popstate', back)
    return () => window.removeEventListener('popstate', back)
  }, [me, screen, publicId])
  useEffect(() => {
    if (!me?.profileCompleted) return
    let active = true
    const update = <T,>(setter: (value: T) => void) => (value: T) => { if (active) setter(value) }
    const request = screen === 'diary' ? api<Journal[]>('/api/journals').then(update(setJournals))
      : screen === 'myJournals' ? api<Journal[]>('/api/users/me/journals').then(update(setJournals))
      : screen === 'ranking' ? api<PublicProfile[]>('/api/rankings').then(update(setRanking))
      : screen === 'publicProfile' && publicId ? Promise.all([api<PublicProfile>(`/api/users/${publicId}/profile`), api<Journal[]>(`/api/users/${publicId}/journals`)]).then(([profile, records]) => { if (active) { setPublicProfile(profile); setJournals(records) } })
      : screen === 'profile' ? api<Member>('/api/users/me').then(update(setMe)) : Promise.resolve()
    request.catch(e => { if (active) fail(e) }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [screen, publicId, me?.profileCompleted])
  const openProfile = (id: number) => { window.history.pushState({ toPeakProfile: true }, '', `#users/${id}`); setBusy(true); setPublicProfile(null); setJournals([]); setPublicId(id); setScreen('publicProfile') }
  const saveProfile = async () => {
    const year = Number(birthYear)
    if (!nickname.trim() || nickname.trim().length > 30) { setError('닉네임은 1~30자로 입력해주세요.'); return }
    if (!/^\d{4}$/.test(birthYear) || year < 1900 || year > new Date().getFullYear()) { setError('출생연도는 1900년부터 현재 연도 사이로 입력해주세요.'); return }
    setBusy(true); setError('')
    try { const user = await api<Member>('/api/users/me/profile', 'PATCH', { nickname: nickname.trim(), birthYear: year }); setMe(user); setScreen('explore') } catch (e) { fail(e) } finally { setBusy(false) }
  }
  const saveJournal = async () => {
    if (!title.trim() || !date || date > localDate()) { setError('제목과 올바른 등산 날짜를 입력해주세요.'); return }
    setBusy(true); setError('')
    try { await api(`/api/journals${editing ? `/${editing}` : ''}`, editing ? 'PATCH' : 'POST', { mountainName: journalMountain || mountain.name, title, content, hikingDate: date, isPublic }); setJournals([]); setScreen('myJournals') } catch (e) { fail(e); setBusy(false) }
  }
  const avatar = (profile: PublicProfile) => <span className="avatar">☺{profile.profileImageUrl && <img src={profile.profileImageUrl} alt="프로필" referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.display = 'none' }}/>}</span>
  const journalList = () => busy ? <p role="status">불러오는 중…</p> : journals.length ? journals.map(j => <article className="diary-card" key={j.id}><MountainArt small/><div><b>{j.title}</b><small>{j.mountainName} · {j.hikingDate} · {j.nickname}</small><p className="journal-content">{j.content}</p>{screen === 'myJournals' && <button onClick={() => { setEditing(j.id); setTitle(j.title); setContent(j.content); setDate(j.hikingDate); setJournalMountain(j.mountainName); setIsPublic(j.isPublic); setScreen('write') }}>수정</button>}</div><span className="badge">{j.isPublic ? '공개' : '비공개'}</span></article>) : <p className="muted">아직 등산일지가 없습니다.</p>
  if (loading) return <main className="app-shell"><p role="status">로그인 정보를 확인하는 중…</p></main>

  const header = (title: string, back = false) => <header className="topbar">{back ? <button className="back" onClick={() => screen === 'publicProfile' && window.history.state?.toPeakProfile ? window.history.back() : go(screen === 'publicProfile' ? 'ranking' : screen === 'myJournals' ? 'profile' : 'explore')}>‹ <span>Back</span></button> : <span className="header-spacer" aria-hidden="true"/>}<strong>{title}</strong><button className="icon-button" onClick={() => go('settings')} aria-label="설정">{back ? '☰' : '⋯'}</button></header>
  const tabs = <nav className="tabbar">{([['explore','mountain','산 탐색'],['ranking','♜','랭킹'],['diary','▤','등산일지'],['profile','☻','마이']] as [Screen,string,string][]).map(([id,icon,label]) => <button key={id} className={screen === id || (screen === 'detail' && id === 'explore') || (screen === 'write' && id === 'diary') || (screen === 'myJournals' && id === 'profile') || (screen === 'publicProfile' && id === 'ranking') ? 'active' : ''} onClick={() => go(id)}><span>{icon === 'mountain' ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m2 20 7-14 5 8 3-5 5 11H2Z"/><path d="m6 12 3 2 2-2"/></svg> : icon}</span>{label}</button>)}</nav>
  const card = (index: number, compact = false) => <MountainCard key={mountains[index].name} mountain={mountains[index]} compact={compact} onClick={() => { setSelected(index); go('detail') }}/>

  return <main className="app-shell">
    {error && <div className="error-banner" role="alert">{error}<button onClick={() => setError('')}>닫기</button></div>}
    {screen === 'login' && <section className="login-screen"><div className="login-brand"><BrandMark/><p>기록하고 즐겁게 오르는 방법</p></div><div className="login-actions"><button className="social google" onClick={() => window.location.assign('/oauth2/authorization/google')}><b>G</b> Google로 시작하기</button><button className="social kakao" onClick={() => window.location.assign('/oauth2/authorization/kakao')}><b>●</b> 카카오로 시작하기</button><small>간편하게 시작하고 나만의 산행을 기록해보세요</small></div></section>}

    {screen === 'explore' && <>{header('찾기 탐색')}<div className="scroll-content"><label className="search"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="경기도 이름을 검색해 보세요"/></label><RegionExplorer/><section className="weather"><div><small>남양주</small><b>☀️ 21°</b></div><div className="weather-details">맑음　바람 약함<br/><small>오늘 산행하기 좋은 날이에요</small></div></section><div className="section-heading"><b>산별 추천</b><button>전체 보기</button></div><div className="difficulty"><span>산행 환경</span><i>Easy</i><i>Mid</i><i>Hard</i></div>{mountains.map((_, i) => card(i, true))}</div>{tabs}</>}

    {screen === 'detail' && <>{header('상세', true)}<div className="scroll-content detail-content"><MountainArt/><div className="detail-title"><div><h1>{mountain.name}</h1><small>{mountain.area}</small></div><button className="heart">♡</button></div><div className="stats"><div><b>{mountain.height}</b><small>세로 높지</small></div><div><b>{mountain.distance}</b><small>거리 코스</small></div><div><b>보통</b><small>난이도</small></div></div><h3>다른 사람들의 공개 기록</h3>{card(0,true)}{card(1,true)}<div className="bottom-actions"><button onClick={() => go('diary')}>등산 기록하기</button><button className="primary" onClick={() => { setStarted(true); go('hiking') }}>등산 앱과 연동하기</button></div></div>{tabs}</>}

    {screen === 'hiking' && <>{header('등산 중', true)}<div className="trail-map"><div className="map-pattern dense"/><svg className="trail-line" viewBox="0 0 300 400"><path d="M145 375 C120 330 184 310 156 270 S115 210 160 178 204 134 170 100 160 65 185 28" fill="none" stroke="#155b43" strokeWidth="6" strokeLinecap="round" strokeDasharray="2 3"/></svg><span className="live-pill">Ⅱ 오프라인</span><span className="map-control">◎</span><span className="map-control second">➤</span><span className="trail-start">시작</span></div><div className="hike-panel"><div className="hike-stats"><b>⌁ 520m</b><b>↪ 2.3km</b></div><div className="hike-stats timer"><b>{started ? '00:18:42' : '01:15:20'}</b><b>◴ 2.4km/h</b></div><div className="bottom-actions"><button onClick={() => setStarted(!started)}>{started ? 'Ⅱ 일시정지' : '▶ 계속하기'}</button><button className="primary" onClick={() => go('write')}>■ 등산 완료</button></div></div>{tabs}</>}

    {screen === 'setup' && <>{header('프로필 설정')}<form className="scroll-content form-content" onSubmit={e => { e.preventDefault(); void saveProfile() }}><h2>To Peak에서 사용할<br/>정보를 입력해주세요.</h2><label>닉네임<input value={nickname} onChange={e => setNickname(e.target.value)} maxLength={30} required autoComplete="nickname"/></label><label>출생연도<input value={birthYear} onChange={e => setBirthYear(e.target.value)} inputMode="numeric" placeholder="2003" maxLength={4} required/></label><p className="muted">출생연도만 입력해주세요.</p><button className="submit" disabled={busy}>시작하기</button></form></>}
    {(screen === 'diary' || screen === 'myJournals') && <>{header(screen === 'diary' ? '등산일지' : '내 등산일지', screen === 'myJournals')}<div className="scroll-content"><div className="section-heading"><b>{screen === 'diary' ? '등산일지' : '내 등산일지'}</b><button onClick={() => go('write')}>기록 작성 ＋</button></div>{journalList()}</div>{tabs}</>}
    {screen === 'write' && <>{header(editing ? '일지 수정' : '일지 작성')}<form className="scroll-content form-content" onSubmit={e => { e.preventDefault(); void saveJournal() }}><h2>오늘의 산행을 기록해요</h2><p className="muted">멋있었던 순간을 남겨보세요</p><label>산 선택<select value={journalMountain || mountain.name} onChange={e => setJournalMountain(e.target.value)}>{!mountains.some(m => m.name === journalMountain) && journalMountain && <option>{journalMountain}</option>}{mountains.map(m => <option key={m.name}>{m.name}</option>)}</select></label><label>등산 날짜<input type="date" value={date} max={localDate()} onChange={e => setDate(e.target.value)} required/></label><label>제목<input value={title} onChange={e => setTitle(e.target.value)} maxLength={100} required placeholder="산행 제목을 입력하세요"/></label><label>오늘의 여정<textarea value={content} onChange={e => setContent(e.target.value)} maxLength={10000} rows={4}/></label><div className="switch-row"><b>다른 사용자에게 공개</b><button type="button" role="switch" aria-checked={isPublic} aria-label="다른 사용자에게 공개" className={`switch ${isPublic ? 'on' : ''}`} onClick={() => setIsPublic(!isPublic)}><span/></button></div><button className="submit" disabled={busy}>기록 저장하기</button></form>{tabs}</>}
    {screen === 'profile' && me && <>{header('마이페이지')}<div className="scroll-content profile-content"><article className="profile-card">{avatar(me)}<div><b>{me.nickname}</b>{me.age !== null && <small>{me.age}살</small>}</div></article><div className="profile-stats"><div><b>{scoreText(me.score)}</b><small>내 점수</small></div></div><button className="settings-link" onClick={() => go('myJournals')}>내 등산일지　›</button><button className="settings-link" onClick={() => go('settings')}>설정　›</button></div>{tabs}</>}
    {screen === 'publicProfile' && <>{header('사용자 프로필', true)}<div className="scroll-content profile-content">{busy ? <p role="status">불러오는 중…</p> : publicProfile && <><article className="profile-card">{avatar(publicProfile)}<div><b>{publicProfile.nickname}</b><small>{scoreText(publicProfile.score)}</small></div></article><h3>등산일지</h3>{journalList()}</>}</div>{tabs}</>}

    {screen === 'settings' && <>{header('설정', true)}<div className="scroll-content settings-content"><h2>계정 설정</h2><button disabled={busy} onClick={async () => { setBusy(true); try { await api('/api/logout', 'POST'); setMe(null); setScreen('login'); window.history.replaceState(null, '', '/') } catch(e) { fail(e) } finally { setBusy(false) } }}>로그아웃</button>{['계정 설정','오프라인 지도 관리','센서 설정','앱 정보'].map(x=><button key={x}>{x}<span>›</span></button>)}</div>{tabs}</>}

    {screen === 'ranking' && <>{header('랭킹')}<div className="scroll-content"><div className="ranking-hero"><span>산행 랭킹</span><b>함께 오르는 즐거움</b><div>🥈　🥇　🥉</div></div><h2>등산러</h2>{busy ? <p role="status">불러오는 중…</p> : ranking.map((user, i) => <button className="rank-row" key={user.userId} onClick={() => openProfile(user.userId)}><strong>{user.score === null ? '—' : i + 1}</strong>{avatar(user)}<b>{user.nickname}</b><small>{scoreText(user.score)}</small></button>)}{!busy && !ranking.length && <p className="muted">등록된 사용자가 없습니다.</p>}<h3>이달의 추천 산</h3>{mountains.map((_,i)=>card(i,true))}</div>{tabs}</>}

  </main>
}

export default App
