type WithdrawalNotice = {
  userId: number;
  failed: boolean;
};

type Props = {
  withdrawalNotice: WithdrawalNotice | null;
  logoutError: boolean;
  error: string;
  profileAccountChanged: boolean;
  favoriteError: string;
  profileCompleted: boolean;
  busy: boolean;
  onRetryWithdrawalCleanup: (userId: number) => void;
  onDismissWithdrawal: () => void;
  onRetryLogout: () => void;
  onDismissLogout: () => void;
  onDismissError: () => void;
};

// 전역 안내 문구와 재시도 동작을 한곳에 모아 모든 화면에서 같은 방식으로 노출한다.
export default function AppNotices({
  withdrawalNotice,
  logoutError,
  error,
  profileAccountChanged,
  favoriteError,
  profileCompleted,
  busy,
  onRetryWithdrawalCleanup,
  onDismissWithdrawal,
  onRetryLogout,
  onDismissLogout,
  onDismissError,
}: Props) {
  return (
    <>
      {withdrawalNotice && (
        <div className="error-banner" role="status">
          <span>
            {withdrawalNotice.failed
              ? '회원탈퇴는 완료됐지만 이 브라우저의 일부 저장 정보를 정리하지 못했어요. 저장소 설정을 확인한 뒤 다시 시도해주세요.'
              : '회원탈퇴가 완료되었습니다.'}
          </span>
          {withdrawalNotice.failed && (
            <button type="button" onClick={() => onRetryWithdrawalCleanup(withdrawalNotice.userId)}>
              브라우저 정보 정리 다시 시도
            </button>
          )}
          <button type="button" onClick={onDismissWithdrawal}>
            닫기
          </button>
        </div>
      )}
      {logoutError && (
        <div className="error-banner" role="alert">
          로그아웃 완료를 확인하지 못했습니다. 다시 시도해주세요.
          <button type="button" disabled={busy} onClick={onRetryLogout}>
            로그아웃 다시 시도
          </button>
          <button type="button" onClick={onDismissLogout}>
            닫기
          </button>
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          {error}
          {profileAccountChanged && (
            <button type="button" onClick={() => window.location.reload()}>
              현재 로그인 계정 다시 확인
            </button>
          )}
          <button type="button" onClick={onDismissError}>
            닫기
          </button>
        </div>
      )}
      {profileCompleted && favoriteError && (
        <div className="error-banner" role="alert">
          {favoriteError}
        </div>
      )}
    </>
  );
}
