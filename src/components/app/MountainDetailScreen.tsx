import type { Mountain } from '../../data/exploreRegions';
import type { HikingSelection } from '../hiking/services/hikingNavigation';
import MountainCourseInfo from '../MountainCourseInfo';
import MountainWeather from '../MountainWeather';

type Props = {
  mountain: Mountain | undefined;
  loading: boolean;
  error: string;
  favorite: boolean;
  onRetry: () => void;
  onExplore: () => void;
  onFavoriteToggle: (id: string) => void;
  onSelectCourse: (selection: HikingSelection) => void;
  onOpenDiary: () => void;
  onOpenHiking: () => void;
};

export default function MountainDetailScreen({
  mountain,
  loading,
  error,
  favorite,
  onRetry,
  onExplore,
  onFavoriteToggle,
  onSelectCourse,
  onOpenDiary,
  onOpenHiking,
}: Props) {
  if (!mountain) {
    return (
      <div className="scroll-content">
        {loading ? (
          <p role="status">산 정보를 불러오는 중…</p>
        ) : error ? (
          <div role="alert">
            <p>{error}</p>
            <button onClick={onRetry}>다시 시도</button>
          </div>
        ) : (
          <p>선택한 산을 찾을 수 없습니다. 산 탐색에서 다시 선택해주세요.</p>
        )}
        <button onClick={onExplore}>산 탐색으로</button>
      </div>
    );
  }

  return (
    <div className="scroll-content detail-content">
      <div className="detail-title">
        <div>
          <h1>{mountain.name}</h1>
          <small>{mountain.city}</small>
        </div>
        <button
          className={`heart ${favorite ? 'is-favorite' : ''}`}
          aria-label={favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
          aria-pressed={favorite}
          onClick={() => onFavoriteToggle(mountain.id)}
        >
          {favorite ? '♥' : '♡'}
        </button>
      </div>
      <div className="stats">
        <div>
          <b>{mountain.height}</b>
          <small>높이</small>
        </div>
        <div>
          <b>{mountain.distance}</b>
          <small>코스 거리</small>
        </div>
        <div>
          <b>코스별 확인</b>
          <small>난이도</small>
        </div>
      </div>
      <MountainWeather mountainId={mountain.id} />
      <MountainCourseInfo
        key={mountain.id}
        mountainId={mountain.id}
        onSelectCourse={onSelectCourse}
      />
      <div className="bottom-actions">
        <button onClick={onOpenDiary}>등산 기록하기</button>
        <button className="primary" onClick={onOpenHiking}>
          등산 앱과 연동하기
        </button>
      </div>
    </div>
  );
}
