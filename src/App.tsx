import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import HikingPage from './components/hiking/HikingPage';
import MountainCard, { MountainArt } from './components/MountainCard';
import MyPage from './components/profile/MyPage';
import MountainCollection from './components/profile/MountainCollection';
import RankingPage from './components/ranking/RankingPage';
import { regions } from './data/exploreRegions';
import { usePersistentIds } from './hooks/usePersistentIds';
import { useMonthlyGoals } from './hooks/useMonthlyGoals';
import { clearLegacyMemberImages } from './utils/memberImages';
import SideDrawer from './components/common/SideDrawer';
import ComingSoonPage from './components/common/ComingSoonPage';
import {
  api,
  ApiError,
  deleteJournal,
  getJournal,
  getHikingRecords,
  createJournal,
  updateJournal,
  type HikingActivity,
  scoreText,
  type Member,
  type Journal,
  type PublicProfile } from './api';

const RegionExplorer = lazy(() => import('./components/RegionExplorer'));

type Screen =
  | 'login'
  | 'explore'
  | 'detail'
  | 'hiking'
  | 'hikingTracking'
  | 'diary'
  | 'journalDetail'
  | 'write'
  | 'profile'
  | 'accountSettings'
  | 'hikingRecords'
  | 'ranking'
  | 'setup'
  | 'myJournals'
  | 'publicProfile'
  | 'favorites'
  | 'conquered'
  | 'about';

const mountains = [
  {
    id: 'featured:천안산',
    name: '천안산',
    area: '경기도 남양주시 서쪽',
    height: '812m',
    distance: '3.8km',
    time: '2시간 10분',
    color: 'sage',
  },
  {
    id: 'featured:운길산',
    name: '운길산',
    area: '경기도 남양주시 조안면',
    height: '610m',
    distance: '2.1km',
    time: '1시간 25분',
    color: 'mint',
  },
  {
    id: 'featured:축령산',
    name: '축령산',
    area: '경기도 남양주시 수동면',
    height: '886m',
    distance: '5.2km',
    time: '3시간 20분',
    color: 'olive',
  },
];

function BrandMark() {
  return (
    <div className="brand-mark" aria-label="ToPeak 로고">
      <svg viewBox="0 0 160 130" role="img">
        <path d="M8 119 63 22l18 34 18-48 53 111H8Z" fill="#155b43" />
        <path d="m36 119 45-70 15 23 19-36 31 83H36Z" fill="#34825e" />
        <path
          d="M77 29c-4 15 17 20 7 31-7 8-23 10-26 24-2 11 6 19 17 25"
          fill="none"
          stroke="#f8f6e9"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path
          d="m69 105 8 8 4-12"
          fill="none"
          stroke="#f8f6e9"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <strong>ToPeak</strong>
    </div>
  );
}

// 화면 상태와 회원 상태를 한곳에서 조율하며, history/hash를 통해 뒤로 가기와 상세 링크를 복원한다.
function App() {
  const [screen, setCurrentScreen] = useState<Screen>('login');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [me, setMe] = useState<Member | null>(null);
  const accountVersion = useRef(0);
  const memberImageVersion = useRef(0);
  const [nickname, setNickname] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [journals, setJournals] = useState<Journal[]>([]);
  const [journalId, setJournalId] = useState<number | null>(null);
  const [journalDetail, setJournalDetail] = useState<Journal | null>(null);
  const [deletingJournalId, setDeletingJournalId] = useState<number | null>(null);
  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null);
  const [publicId, setPublicId] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [date, setDate] = useState('');
  const [hikingRecords, setHikingRecords] = useState<HikingActivity[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
  const selectedRecord = hikingRecords.find(record => record.id === selectedRecordId);
  const availableRecords = hikingRecords.filter(record => record.journalId === null);
  const [journalMountain, setJournalMountain] = useState('');
  const [selected, setSelected] = useState(0);
  const [exploreRegion, setExploreRegion] = useState(0);
  const [exploreCity, setExploreCity] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const { ids: favoriteIds, toggle: toggleFavorite } = usePersistentIds(
    'topeak.favoriteMountainIds',
  );
  const { ids: conqueredIds, toggle: toggleConquered } = usePersistentIds(
    'topeak.completedMountainIds',
  );
  const { goals: monthlyGoals, saveGoals, error: goalsError } = useMonthlyGoals();
  const mountain = mountains[selected];
  const mountainCatalog = useMemo(
    () => [
      ...regions.flatMap((region) =>
        region.cities.flatMap((city) =>
          city.mountains.map((item) => ({
            ...item,
            city: city.name,
            region: region.name,
          })),
        ),
      ),
      ...mountains.map((item) => ({ ...item, city: item.area, region: '추천 산' })),
    ],
    [],
  );
  const favoriteMountains = mountainCatalog.filter((item) => favoriteIds.includes(item.id));
  const conqueredMountains = mountainCatalog.filter((item) => conqueredIds.includes(item.id));
  // 상세 링크에는 대상 ID를, history에는 화면과 선택 산을 저장한다.
  // 초기화·로그인·삭제 후 이동은 replace로 처리해 불필요하거나 유효하지 않은 이력을 남기지 않는다.
  const setScreen = (
    next: Screen,
    nextPublicId = publicId,
    nextMountain = selected,
    nextJournalId = journalId,
    replaceCurrent = false) => {
    const previous = window.history.state;
    const index = typeof previous?.toPeakIndex === 'number' ? previous.toPeakIndex : 0;
    const replace = loading || next === 'login' || replaceCurrent;
    const state = {
      toPeakScreen: next,
      toPeakIndex: next === 'login' ? 0 : replace ? index : index + 1,
      toPeakMountain: nextMountain,
      toPeakPublicId: nextPublicId,
      toPeakJournalId: nextJournalId,
    };
    const url = `${window.location.pathname}${window.location.search}${
      next === 'publicProfile' && nextPublicId
        ? `#users/${nextPublicId}`
        : next === 'journalDetail' && nextJournalId
          ? `#journals/${nextJournalId}`
          : ''
    }`;
    if (replace) window.history.replaceState(state, '', url);
    else if (
      previous?.toPeakScreen !== next ||
      (next === 'publicProfile' && previous?.toPeakPublicId !== nextPublicId) ||
      (next === 'journalDetail' && previous?.toPeakJournalId !== nextJournalId)
    )
      window.history.pushState(state, '', url);
    setCurrentScreen(next);
  };
  // 일반 메뉴 이동은 세션과 프로필 완료 여부를 먼저 확인하고, 이전 화면의 조회 결과를 비운다.
  const go = (next: Screen, nextMountain = selected) => {
    setDrawerOpen(false);
    setError('');
    if (!me) {
      setScreen('login');
      return;
    }
    if (!me.profileCompleted) {
      setScreen('setup');
      return;
    }
    if (next === 'write') {
      setEditing(null);
      setTitle('');
      setContent('');
      setJournalMountain('');
      setDate('');
      setSelectedRecordId(null);
      setHikingRecords([]);
      setIsPublic(false);
    }
    if (next === screen) return;
    setBusy(['diary', 'myJournals', 'ranking', 'publicProfile', 'profile', 'write', 'hikingRecords'].includes(next));
    setJournals([]);
    setPublicProfile(null);
    setScreen(next, publicId, nextMountain);
  };
  const goBack = () => {
    if (window.history.state?.toPeakIndex > 0) window.history.back();
    else
      go(
        screen === 'journalDetail'
          ? journalDetail?.userId === me?.userId
            ? 'myJournals'
            : 'diary'
          : 'explore');
  };
  // 계정 세대를 증가시켜 로그아웃 이전의 비동기 응답이 새 회원 상태에 반영되지 않게 한다.
  const clearAccount = useCallback(() => {
    accountVersion.current += 1;
    clearLegacyMemberImages();
    setMe(null);
    setNickname('');
    setBirthYear('');
    setJournals([]);
    setPublicProfile(null);
    setPublicId(null);
    setDeletingJournalId(null);
    setJournalId(null);
    setJournalDetail(null);
    setHikingRecords([]);
    setSelectedRecordId(null);
    setEditing(null);
  }, []);
  const fail = useCallback(
    (e: unknown) => {
      setError(e instanceof Error ? e.message : '요청에 실패했습니다.');
      if (e instanceof ApiError && e.status === 401) {
        setDrawerOpen(false);
        clearAccount();
        window.history.replaceState(
          { toPeakScreen: 'login', toPeakIndex: 0 },
          '',
          `${window.location.pathname}${window.location.search}`,
        );
        setCurrentScreen('login');
      }
    },
    [clearAccount],
  );
  // 첫 진입 시 서버 세션을 확인한 뒤 프로필 설정, 상세 hash, 저장된 화면 순서로 진입 위치를 결정한다.
  useEffect(() => {
    clearLegacyMemberImages();
    const version = accountVersion.current;
    let active = true;
    const initializeScreen = (
      next: Screen,
      id: number | null = null,
      mountainIndex = 0,
      detailId: number | null = null) => {
      window.history.replaceState(
        {
          toPeakScreen: next,
          toPeakIndex:
            typeof window.history.state?.toPeakIndex === 'number'
              ? window.history.state.toPeakIndex
              : 0,
          toPeakMountain: mountainIndex,
          toPeakPublicId: id,
          toPeakJournalId: detailId,
        },
        '',
        `${window.location.pathname}${window.location.search}${
          next === 'publicProfile' && id
            ? `#users/${id}`
            : next === 'journalDetail' && detailId
              ? `#journals/${detailId}`
              : ''
        }`,
      );
      setCurrentScreen(next);
    };
    api<Member>('/api/users/me')
      .then((user) => {
        if (!active || version !== accountVersion.current) return;
        setMe(user);
        setNickname(user.nickname ?? '');
        const match = window.location.hash.match(/^#users\/(\d+)$/);
        const detailMatch = window.location.hash.match(/^#journals\/(\d+)$/);
        if (!user.profileCompleted) initializeScreen('setup');
        else if (detailMatch) {
          setBusy(true);
          setJournalId(Number(detailMatch[1]));
          initializeScreen('journalDetail', null, 0, Number(detailMatch[1]));
        } else if (match) {
          setBusy(true);
          setPublicId(Number(match[1]));
          initializeScreen('publicProfile', Number(match[1]));
        } else {
          const saved = window.history.state;
          const screens: Screen[] = [
            'hikingTracking',
            'explore',
            'detail',
            'diary',
            'profile',
            'accountSettings',
            'hikingRecords',
            'ranking',
            'setup',
            'myJournals',
            'favorites',
            'conquered',
            'about',
          ];
          if (screens.includes(saved?.toPeakScreen)) {
            setSelected(
              typeof saved.toPeakMountain === 'number' && mountains[saved.toPeakMountain]
                ? saved.toPeakMountain
                : 0,
            );
            initializeScreen(saved.toPeakScreen, null, saved.toPeakMountain ?? 0);
          } else initializeScreen('explore');
        }
      })
      .catch((e) => {
        if (
          active &&
          version === accountVersion.current &&
          (!(e instanceof ApiError) || e.status !== 401)
        )
          fail(e);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fail]);
  // 브라우저 뒤로 가기는 새 이력을 만들지 않고 기존 화면과 대상 ID를 복원한다.
  // 복원할 화면도 현재 로그인·프로필 상태의 제한을 따른다.
  useEffect(() => {
    const back = () => {
      setDrawerOpen(false);
      if (!me) {
        setCurrentScreen('login');
        return;
      }
      if (!me.profileCompleted) {
        setCurrentScreen('setup');
        return;
      }
      const state = window.history.state;
      const match = window.location.hash.match(/^#users\/(\d+)$/);
      const detailMatch = window.location.hash.match(/^#journals\/(\d+)$/);
      const screens: Screen[] = [
        'hikingTracking',
        'explore',
        'detail',
        'hiking',
        'diary',
        'journalDetail',
        'write',
        'profile',
        'accountSettings',
        'hikingRecords',
        'ranking',
        'setup',
        'myJournals',
        'publicProfile',
        'favorites',
        'conquered',
        'about',
      ];
      const next: Screen = detailMatch
        ? 'journalDetail'
        : match
          ? 'publicProfile'
          : screens.includes(state?.toPeakScreen)
            ? state.toPeakScreen
            : 'explore';
      setError('');
      setBusy(
        ['diary', 'myJournals', 'ranking', 'publicProfile', 'profile', 'journalDetail', 'write', 'hikingRecords'].includes(
          next));
      setJournalDetail(null);
      setJournalId(detailMatch ? Number(detailMatch[1]) : (state?.toPeakJournalId ?? null));
      setJournals([]);
      setPublicProfile(null);
      setPublicId(match ? Number(match[1]) : (state?.toPeakPublicId ?? null));
      if (typeof state?.toPeakMountain === 'number' && mountains[state.toPeakMountain])
        setSelected(state.toPeakMountain);
      setCurrentScreen(next);
    };
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, [me, screen, publicId]);
  // 화면별로 본인 일지·공개 일지·타인 프로필을 조회하고, 화면 이탈이나 계정 변경 뒤의 응답은 버린다.
  useEffect(() => {
    if (!me?.profileCompleted) return;
    const version = accountVersion.current;
    // 마이페이지 조회 중 이미지가 갱신되면 늦게 도착한 회원 응답이 최신 이미지 URL을 덮어쓰지 않게 한다.
    const imageVersion = memberImageVersion.current;
    let active = true;
    const update =
      <T,>(setter: (value: T) => void) =>
      (value: T) => {
        if (active && version === accountVersion.current) setter(value);
      };
    const request =
      screen === 'journalDetail' && journalId
        ? getJournal(journalId).then(update(setJournalDetail))
        : screen === 'diary'
          ? api<Journal[]>('/api/journals').then(update(setJournals))
          : screen === 'myJournals'
            ? api<Journal[]>('/api/users/me/journals').then(update(setJournals))
            : screen === 'publicProfile' && publicId
              ? Promise.all([
                  api<PublicProfile>(`/api/users/${publicId}/profile`),
                  api<Journal[]>(`/api/users/${publicId}/journals`),
                ]).then(([profile, records]) => {
                  if (active && version === accountVersion.current) {
                    setPublicProfile(profile);
                    setJournals(records);
                  }
                })
              : screen === 'profile'
                ? Promise.all([
                    api<Member>('/api/users/me'),
                    api<Journal[]>('/api/users/me/journals'),
                  ]).then(([user, records]) => {
                    if (active && version === accountVersion.current) {
                      setMe((current) =>
                        current?.userId === user.userId &&
                        imageVersion !== memberImageVersion.current
                          ? {
                              ...user,
                              profileImageUrl: current.profileImageUrl,
                              backgroundImageUrl: current.backgroundImageUrl,
                            }
                          : user,
                      );
                      setJournals(records);
                    }
                  })
                : (screen === 'write' && !editing) || screen === 'hikingRecords'
                  ? getHikingRecords().then(update(setHikingRecords))
                  : Promise.resolve();
    request
      .catch((e) => {
        if (active && version === accountVersion.current) fail(e);
      })
      .finally(() => {
        if (active && version === accountVersion.current) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [screen, publicId, journalId, editing, me?.profileCompleted, fail]);
  useEffect(() => {
    document.title = 'ToPeak';
  }, []);
  const openProfile = (id: number) => {
    setBusy(true);
    setPublicProfile(null);
    setJournals([]);
    setPublicId(id);
    setScreen('publicProfile', id);
  };
  const logout = async () => {
    setDrawerOpen(false);
    setBusy(true);
    clearAccount();
    setScreen('login');
    window.history.replaceState(null, '', '/');
    try {
      await api('/api/logout', 'POST');
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  };
  // 프로필 저장 응답을 회원 상태에 반영한 뒤, 최초 설정과 기존 프로필 편집의 복귀 화면을 구분한다.
  const saveProfile = async () => {
    const version = accountVersion.current;
    const year = Number(birthYear);
    if (!nickname.trim() || nickname.trim().length > 30) {
      setError('닉네임은 1~30자로 입력해주세요.');
      return;
    }
    if (!/^\d{4}$/.test(birthYear) || year < 1900 || year > new Date().getFullYear()) {
      setError('출생연도는 1900년부터 현재 연도 사이로 입력해주세요.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const user = await api<Member>('/api/users/me/profile', 'PATCH', {
        nickname: nickname.trim(),
        birthYear: year,
      });
      if (version !== accountVersion.current) return;
      setMe(user);
      setScreen(me?.profileCompleted ? 'profile' : 'explore');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  // 같은 작성 폼을 신규 작성과 수정에 사용하고, 저장 뒤 본인 목록을 다시 조회하도록 전환한다.
  const saveJournal = async () => {
    if (busy) return;
    const version = accountVersion.current;
    if (!title.trim() || (!editing && (!selectedRecord || selectedRecord.journalId !== null))) {
      setError('등산기록을 선택하고 제목을 입력해주세요.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const input = { title, content, isPublic };
      if (editing) await updateJournal(editing, input);
      else await createJournal({ ...input, hikingRecordId: selectedRecord!.id });
      if (version !== accountVersion.current) return;
      setJournals([]);
      setScreen('myJournals');
    } catch (e) {
      if (version !== accountVersion.current) return;
      fail(e);
      setBusy(false);
      if (e instanceof ApiError && e.status === 409) {
        getHikingRecords().then(records => {
          if (version === accountVersion.current) setHikingRecords(records);
        }).catch(fail);
      }
    }
  };
  const avatar = (profile: PublicProfile) => (
    <span className="avatar">
      ☺
      {profile.profileImageUrl && (
        <img
          src={profile.profileImageUrl}
          alt="프로필"
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      )}
    </span>
  );
  // 화면에서 중복 삭제와 타인 일지 삭제를 막고, 실제 소유권은 서버가 다시 검증한다.
  // 삭제한 상세 화면은 history에서 교체해 뒤로 가기로 같은 항목을 다시 열지 않게 한다.
  const removeJournal = async (journal: Journal) => {
    if (screen !== 'journalDetail' || journal.userId !== me?.userId || deletingJournalId !== null)
      return;
    if (!window.confirm('등산일지를 삭제하시겠습니까?')) return;
    const version = accountVersion.current;
    setDeletingJournalId(journal.id);
    setError('');
    try {
      await deleteJournal(journal.id);
      if (version === accountVersion.current) {
        setJournals((current) => current.filter((item) => item.id !== journal.id));
        setJournalDetail((current) => current?.id === journal.id ? null : current);
        if (
          window.history.state?.toPeakScreen === 'journalDetail' &&
          window.history.state?.toPeakJournalId === journal.id
        ) {
          setBusy(true);
          setScreen('myJournals', publicId, selected, null, true);
        }
      }
    } catch (cause) {
      if (version === accountVersion.current) fail(cause);
    } finally {
      if (version === accountVersion.current) setDeletingJournalId(null);
    }
  };
  // 목록의 ID로 상세 API를 다시 조회하므로 본문과 접근 권한은 서버의 최신 상태를 따른다.
  const openJournal = (id: number) => {
    setError('');
    setBusy(true);
    setJournalDetail(null);
    setJournalId(id);
    setScreen('journalDetail', publicId, selected, id);
  };
  // 본인 일지의 값과 ID를 작성 폼에 넘겨 신규 작성 대신 기존 일지를 수정하게 한다.
  const editJournal = (journal: Journal) => {
    if (journal.userId !== me?.userId || deletingJournalId !== null) return;
    setEditing(journal.id);
    setTitle(journal.title);
    setContent(journal.content);
    setDate(journal.hikingDate);
    setJournalMountain(journal.mountainName);
    setIsPublic(journal.isPublic);
    setScreen('write');
  };
  const journalList = () =>
    busy ? (
      <p role="status">불러오는 중…</p>
    ) : journals.length ? (
      journals.map((j) => (
        <article
          className="diary-card diary-card--clickable"
          key={j.id}
          role="button"
          tabIndex={0}
          aria-label={`${j.title} 등산일지 상세 보기`}
          onClick={() => openJournal(j.id)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              openJournal(j.id);
            }
          }}
        >
          <MountainArt small />
          <div>
            <b>{j.title}</b>
            <small>
              {j.mountainName} · {j.hikingDate} · {j.nickname}
            </small>
            <p className="journal-content">{j.content}</p>
          </div>
          <span className="badge">{j.isPublic ? '공개' : '비공개'}</span>
        </article>
      ))
    ) : (
      <p className="muted">아직 등산일지가 없습니다.</p>
    );
  if (loading)
    return (
      <main className="app-shell auth-loading" aria-busy="true">
        <span className="auth-loading__spinner" aria-hidden="true" />
        <p role="status">ToPeak으로 이동 중...</p>
      </main>
    );

  const header = (title: string, back = false) => (
    <header className={`topbar${screen === 'ranking' ? ' topbar--ranking' : ''}`}>
      {back ? (
        <button type="button" className="back" onClick={goBack} aria-label="뒤로가기">
          ‹
        </button>
      ) : (
        <span aria-hidden="true" />
      )}
      <strong>{title}</strong>
      {me?.profileCompleted ? (
        <button
          type="button"
          className="icon-button menu-button"
          onClick={() => setDrawerOpen(true)}
          aria-label="메뉴 열기"
          aria-haspopup="dialog"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      ) : (
        <span aria-hidden="true" />
      )}
    </header>
  );
  const card = (index: number, compact = false) => (
    <MountainCard
      key={mountains[index].name}
      mountain={mountains[index]}
      compact={compact}
      isFavorite={favoriteIds.includes(mountains[index].id)}
      onFavoriteToggle={() => toggleFavorite(mountains[index].id)}
      onClick={() => {
        setSelected(index);
        go('detail', index);
      }}
    />
  );

  return (
    <main className="app-shell">
      <SideDrawer
        open={drawerOpen}
        activeScreen={screen}
        onClose={() => setDrawerOpen(false)}
        onNavigate={go}
        onLogout={() => void logout()}
        busy={busy}
      />
      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button onClick={() => setError('')}>닫기</button>
        </div>
      )}
      {screen === 'login' && (
        <section className="login-screen">
          <div className="login-brand">
            <BrandMark />
            <p>기록하고 즐겁게 오르는 방법</p>
          </div>
          <div className="login-actions">
            <button
              className="social google"
              disabled={busy}
              onClick={() => window.location.assign('/oauth2/authorization/google')}
            >
              <svg viewBox="0 0 48 48" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.7h11a9.4 9.4 0 0 1-4.1 6.2v5h6.6c3.9-3.6 6.1-8.8 6.1-14.8Z"
                />
                <path
                  fill="#34A853"
                  d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.6-5c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.8v5.2A20 20 0 0 0 24 44Z"
                />
                <path
                  fill="#FBBC05"
                  d="M12.6 27.8a12 12 0 0 1 0-7.6V15H5.8a20 20 0 0 0 0 17.9l6.8-5.1Z"
                />
                <path
                  fill="#EA4335"
                  d="M24 11.8c3 0 5.7 1 7.8 3.1l5.8-5.8A19.4 19.4 0 0 0 24 4 20 20 0 0 0 5.8 15l6.8 5.2c1.6-4.8 6.1-8.4 11.4-8.4Z"
                />
              </svg>
              <span>Google로 시작하기</span>
            </button>
            <button
              className="social kakao"
              disabled={busy}
              onClick={() => window.location.assign('/oauth2/authorization/kakao')}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#191919"
                  d="M12 3C6.48 3 2 6.54 2 10.9c0 2.8 1.86 5.26 4.67 6.66l-.96 3.55a.35.35 0 0 0 .53.38l4.2-2.78c.51.07 1.03.1 1.56.1 5.52 0 10-3.54 10-7.91S17.52 3 12 3Z"
                />
              </svg>
              <span>카카오로 시작하기</span>
            </button>
            <small>간편하게 시작하고 나만의 산행을 기록해보세요</small>
          </div>
        </section>
      )}
      {screen === 'explore' && (
        <>
          {header('산 탐색')}
          <div className="scroll-content">
            <Suspense
              fallback={
                <p className="region-loading" role="status">
                  경기도 권역 지도를 불러오는 중…
                </p>
              }
            >
              <RegionExplorer
                activeRegionIndex={exploreRegion}
                onRegionChange={setExploreRegion}
                selectedCity={exploreCity}
                onSelectCity={setExploreCity}
                favoriteIds={favoriteIds}
                onFavoriteToggle={toggleFavorite}
                completedIds={conqueredIds}
                onCompletedToggle={toggleConquered}
              />
            </Suspense>
          </div>
        </>
      )}
      {screen === 'detail' && (
        <>
          {header('상세', true)}
          <div className="scroll-content detail-content">
            <MountainArt />
            <div className="detail-title">
              <div>
                <h1>{mountain.name}</h1>
                <small>{mountain.area}</small>
              </div>
              <button
                className={`heart ${favoriteIds.includes(mountain.id) ? 'is-favorite' : ''}`}
                aria-label={favoriteIds.includes(mountain.id) ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                aria-pressed={favoriteIds.includes(mountain.id)}
                onClick={() => toggleFavorite(mountain.id)}
              >
                {favoriteIds.includes(mountain.id) ? '♥' : '♡'}
              </button>
            </div>
            <div className="stats">
              <div>
                <b>{mountain.height}</b>
                <small>세로 높지</small>
              </div>
              <div>
                <b>{mountain.distance}</b>
                <small>거리 코스</small>
              </div>
              <div>
                <b>보통</b>
                <small>난이도</small>
              </div>
            </div>
            <button
              type="button"
              className="collection-dialog-complete"
              aria-pressed={conqueredIds.includes(mountain.id)}
              onClick={() => toggleConquered(mountain.id)}
            >
              {conqueredIds.includes(mountain.id) ? '완등 기록 해제' : '완등으로 기록'}
            </button>
            <h3>다른 사람들의 공개 기록</h3>
            {card(0, true)}
            {card(1, true)}
            <div className="bottom-actions">
              <button onClick={() => go('diary')}>등산 기록하기</button>
              <button
                className="primary"
                onClick={() => {
                  setStarted(true);
                  go('hikingTracking');
                }}
              >
                등산 앱과 연동하기
              </button>
            </div>
          </div>
        </>
      )}
      {screen === 'hiking' && (
        <>
          {header('등산 중', true)}
          <div className="trail-map">
            <div className="map-pattern dense" />
            <svg className="trail-line" viewBox="0 0 300 400">
              <path
                d="M145 375 C120 330 184 310 156 270 S115 210 160 178 204 134 170 100 160 65 185 28"
                fill="none"
                stroke="#155b43"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray="2 3"
              />
            </svg>
            <span className="live-pill">Ⅱ 오프라인</span>
            <span className="map-control">◎</span>
            <span className="map-control second">➤</span>
            <span className="trail-start">시작</span>
          </div>
          <div className="hike-panel">
            <div className="hike-stats">
              <b>⌁ 520m</b>
              <b>↪ 2.3km</b>
            </div>
            <div className="hike-stats timer">
              <b>{started ? '00:18:42' : '01:15:20'}</b>
              <b>◴ 2.4km/h</b>
            </div>
            <div className="bottom-actions">
              <button onClick={() => setStarted(!started)}>
                {started ? 'Ⅱ 일시정지' : '▶ 계속하기'}
              </button>
              <button className="primary" onClick={() => go('hikingTracking')}>
                실제 산행 시작하기
              </button>
            </div>
          </div>
        </>
      )}
      {screen === 'hikingTracking' && (
        <>
          {header('등산')}
          <HikingPage onWriteJournal={(record) => { go('write'); setSelectedRecordId(record.id); }} />
        </>
      )}
      {screen === 'setup' && (
        <>
          {header(
            me?.profileCompleted ? '프로필 편집' : '프로필 설정',
            Boolean(me?.profileCompleted),
          )}
          <form
            className="scroll-content form-content"
            onSubmit={(e) => {
              e.preventDefault();
              void saveProfile();
            }}
          >
            <h2>
              ToPeak에서 사용할
              <br />
              정보를 입력해주세요.
            </h2>
            <label>
              닉네임
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={30}
                required
                autoComplete="nickname"
              />
            </label>
            <label>
              출생연도
              <input
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value)}
                inputMode="numeric"
                placeholder="2003"
                maxLength={4}
                required
              />
            </label>
            <p className="muted">출생연도만 입력해주세요.</p>
            <button className="submit" disabled={busy}>
              {me?.profileCompleted ? '변경 사항 저장' : '시작하기'}
            </button>
          </form>
        </>
      )}
      {(screen === 'diary' || screen === 'myJournals') && (
        <>
          {header(screen === 'diary' ? '등산일지' : '내 등산일지', screen === 'myJournals')}
          <div className="scroll-content">
            <div className="section-heading">
              <b>{screen === 'diary' ? '등산일지' : '내 등산일지'}</b>
              <button onClick={() => go('write')}>등산일지 작성 ＋</button>
            </div>
            {journalList()}
          </div>
        </>
      )}
      {screen === 'journalDetail' && (
        <>
          {header('등산일지', true)}
          <section className="scroll-content journal-detail">
            {busy ? (
              <p role="status">불러오는 중…</p>
            ) : journalDetail ? (
              <>
                <article className="journal-detail__body">
                  <span className="badge">{journalDetail.isPublic ? '공개' : '비공개'}</span>
                  <h2>{journalDetail.title}</h2>
                  <dl className="journal-detail__meta">
                    <div>
                      <dt>산 이름</dt>
                      <dd>{journalDetail.mountainName}</dd>
                    </div>
                    <div>
                      <dt>등산 날짜</dt>
                      <dd>{journalDetail.hikingDate}</dd>
                    </div>
                    <div>
                      <dt>작성자</dt>
                      <dd>{journalDetail.nickname}</dd>
                    </div>
                  </dl>
                  <p className="journal-detail__content">{journalDetail.content}</p>
                </article>
                {journalDetail.userId === me?.userId && (
                  <div className="bottom-actions">
                    <button
                      type="button"
                      className="primary"
                      disabled={deletingJournalId !== null}
                      onClick={() => editJournal(journalDetail)}
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      disabled={deletingJournalId !== null}
                      onClick={() => void removeJournal(journalDetail)}
                    >
                      {deletingJournalId === journalDetail.id ? '삭제 중…' : '삭제'}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p className="muted">등산일지를 확인할 수 없습니다.</p>
            )}
          </section>
        </>
      )}
      {screen === 'write' && (
        <>
          {header(editing ? '일지 수정' : '일지 작성')}
          <form
            className="scroll-content form-content"
            onSubmit={(e) => {
              e.preventDefault();
              void saveJournal();
            }}
          >
            <h2>오늘의 산행을 기록해요</h2>
            <p className="muted">멋있었던 순간을 남겨보세요</p>
            {!editing && <>
              <label>
                내 등산기록 선택
                <select value={selectedRecordId ?? ''} disabled={busy}
                  onChange={(e) => setSelectedRecordId(e.target.value ? Number(e.target.value) : null)} required>
                  <option value="">등산기록을 선택해주세요</option>
                  {availableRecords.map(record => <option key={record.id} value={record.id}>
                    {record.mountainName} · {record.hikingDate} · {(record.distanceMeters / 1000).toFixed(1)}km · {Math.floor(record.elapsedMs / 60000)}분
                  </option>)}
                </select>
              </label>
              {busy ? <p role="status">등산기록을 불러오는 중…</p> : availableRecords.length === 0 &&
                <p className="muted">작성 가능한 등산기록이 없습니다. 산행을 마치고 기록을 저장해주세요.</p>}
            </>}
            {(editing || selectedRecord) && (
              <dl className="journal-write-summary" aria-label="산행 정보">
                <div>
                  <dt>산</dt>
                  <dd>{editing ? journalMountain : selectedRecord?.mountainName}</dd>
                </div>
                <div>
                  <dt>등산 날짜</dt>
                  <dd>{editing ? date : selectedRecord?.hikingDate}</dd>
                </div>
              </dl>
            )}
            <label>
              제목
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                required
                placeholder="산행 제목을 입력하세요"
              />
            </label>
            <label>
              오늘의 여정
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                maxLength={10000}
                rows={4}
              />
            </label>
            <div className="switch-row">
              <b>다른 사용자에게 공개</b>
              <button
                type="button"
                role="switch"
                aria-checked={isPublic}
                aria-label="다른 사용자에게 공개"
                className={`switch ${isPublic ? 'on' : ''}`}
                onClick={() => setIsPublic(!isPublic)}
              >
                <span />
              </button>
            </div>
            <button className="submit" disabled={busy || (!editing && (!selectedRecord || selectedRecord.journalId !== null))}>
              일지 저장하기
            </button>
          </form>
        </>
      )}
      {screen === 'profile' && me && (
        <>
          <div className="scroll-content my-page-scroll">
            <MyPage
              key={me.userId}
              member={me}
              onMemberUpdated={(updated, kind) => {
                memberImageVersion.current += 1;
                const imageKey = kind === 'profile' ? 'profileImageUrl' : 'backgroundImageUrl';
                setMe((current) =>
                  current?.userId === updated.userId
                    ? { ...current, [imageKey]: updated[imageKey] }
                    : current,
                );
              }}
              onAuthError={fail}
              journals={journals}
              completedCount={conqueredMountains.length}
              totalDistanceKm={0}
              monthlyDistanceKm={0}
              monthlyGoals={monthlyGoals}
              onSaveGoals={saveGoals}
              goalsError={goalsError}
              onSettings={() => setDrawerOpen(true)}
              onEditProfile={() => {
                setNickname(me.nickname);
                setBirthYear(me.birthYear === null ? '' : String(me.birthYear));
                go('setup');
              }}
              onNavigate={go}
            />
          </div>
        </>
      )}
      {(screen === 'favorites' || screen === 'conquered') && (
        <>
          {header(screen === 'favorites' ? '찜한 산' : '완등한 산', true)}
          <div className="scroll-content collection-scroll">
            <MountainCollection
              mode={screen}
              title={screen === 'favorites' ? '내가 찜한 산' : '완등한 산'}
              description={
                screen === 'favorites'
                  ? '마음에 담아둔 산을 모아봤어요.'
                  : '나의 산행을 완등 기록으로 남겨보세요.'
              }
              items={screen === 'favorites' ? favoriteMountains : conqueredMountains}
              favoriteIds={favoriteIds}
              completedIds={conqueredIds}
              onFavoriteToggle={toggleFavorite}
              onCompletedToggle={toggleConquered}
            />
          </div>
        </>
      )}
      {screen === 'publicProfile' && (
        <>
          {header('사용자 프로필', true)}
          <div className="scroll-content profile-content">
            {busy ? (
              <p role="status">불러오는 중…</p>
            ) : (
              publicProfile && (
                <>
                  <article className="profile-card">
                    {avatar(publicProfile)}
                    <div>
                      <b>{publicProfile.nickname}</b>
                      <small>{scoreText(publicProfile.score)}</small>
                    </div>
                  </article>
                  <h3>등산일지</h3>
                  {journalList()}
                </>
              )
            )}
          </div>
        </>
      )}
      {screen === 'hikingRecords' && <>
        {header('등산기록', true)}
        <section className="scroll-content utility-content">
          {busy ? <p role="status">불러오는 중…</p> : hikingRecords.length ? hikingRecords.map(record => (
            <article className="profile-summary" key={record.id}>
              <div><b>{record.mountainName}</b><p>{record.hikingDate}</p>
                <p>{(record.distanceMeters / 1000).toFixed(1)}km · {Math.floor(record.elapsedMs / 60000)}분 · {record.completed ? '완등' : '산행 종료'}</p>
                {record.journalId !== null
                  ? <button onClick={() => openJournal(record.journalId!)}>등산일지 보기</button>
                  : <button onClick={() => { go('write'); setSelectedRecordId(record.id); }}>등산일지 작성</button>}
              </div>
            </article>
          )) : <p>저장된 등산기록이 없습니다.</p>}
        </section>
      </>}
      {screen === 'accountSettings' && (
        <ComingSoonPage title="계정 설정" header={header('계정 설정', true)} />
      )}
      {screen === 'about' && (
        <>
          {header('앱 정보', true)}
          <section className="scroll-content utility-content">
            <h2>ToPeak</h2>
            <p>산을 탐색하고, 나만의 산행을 기록하는 아웃도어 서비스입니다.</p>
          </section>
        </>
      )}
      {screen === 'ranking' && (
        <>
          {header('랭킹')}
          <RankingPage
            currentUserId={me?.userId ?? null}
            onSelectUser={openProfile}
            onAuthError={fail}
          />
        </>
      )}
    </main>
  );
}

export default App;
