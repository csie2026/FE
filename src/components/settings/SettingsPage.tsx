import { getErrorMessage } from '../../utils/errorMessages';
import { useEffect, useRef, useState } from 'react';
import './SettingsPage.css';
import { formatJoinedDate, loginProviderLabel } from '../../services/accountDetails.ts';

type Props = {
  userId: number;
  nickname: string;
  provider?: string | null;
  email?: string | null;
  joinedAt?: string | null;
  onWithdraw: (confirmation: string) => Promise<void>;
};
export default function SettingsPage({
  userId,
  nickname,
  provider,
  email,
  joinedAt,
  onWithdraw,
}: Props) {
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (open) {
      dialog.current?.showModal();
      heading.current?.focus();
    } else dialog.current?.close();
  }, [open]);
  function close() {
    if (pending) return;
    setOpen(false);
    setAcknowledged(false);
    setError('');
    trigger.current?.focus();
  }
  async function submit() {
    if (pending || !acknowledged) return;
    setPending(true);
    setError('');
    try {
      // Explicit checkbox consent and final click preserve the existing API confirmation contract.
      await onWithdraw('탈퇴');
    } catch (cause) {
      setError(getErrorMessage(cause, '탈퇴 완료 여부를 확인하지 못했습니다. 다시 확인하십시오.'));
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="scroll-content settings-content" aria-label="계정">
      <article className="settings-card">
        <h2>회원 정보</h2>
        <p>ToPeak에 등록된 계정 정보입니다.</p>
        <dl className="settings-account-details">
          <div>
            <dt>닉네임</dt>
            <dd>{nickname}</dd>
          </div>
          <div>
            <dt>가입일</dt>
            <dd>{formatJoinedDate(joinedAt)}</dd>
          </div>
          <div>
            <dt>로그인 방식</dt>
            <dd>{loginProviderLabel(provider)}</dd>
          </div>
          <div>
            <dt>이메일</dt>
            <dd>{email?.trim() || '등록된 이메일 없음'}</dd>
          </div>
        </dl>
      </article>
      <article className="settings-card settings-management">
        <h2>계정 관리</h2>
        <p>회원탈퇴 시 계정과 연결된 데이터를 삭제합니다.</p>
        <button
          ref={trigger}
          type="button"
          className="settings-withdraw"
          onClick={() => setOpen(true)}
        >
          회원 탈퇴 <span aria-hidden="true">›</span>
        </button>
      </article>
      <dialog
        ref={dialog}
        className="withdraw-dialog"
        aria-labelledby={`withdraw-title-${userId}`}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        <h2 ref={heading} tabIndex={-1} id={`withdraw-title-${userId}`}>
          회원탈퇴를 진행하시겠습니까?
        </h2>
        <p>회원탈퇴 시 다음 정보가 서비스 운영 데이터베이스에서 삭제되며 복구할 수 없습니다.</p>
        <ul>
          <li>회원 정보와 ToPeak의 소셜 로그인 연결 정보</li>
          <li>GPS 산행 기록과 공개·비공개 등산일지</li>
          <li>업로드한 프로필·배경 이미지와 누적 점수·랭킹 정보</li>
          <li>월별 목표와 이 브라우저에 저장된 해당 계정의 찜·임시 산행 기록</li>
        </ul>
        <p>
          모든 기기의 기존 로그인 세션은 더 이상 사용할 수 없습니다. 동일한 소셜 계정으로 다시
          로그인하면 신규 회원으로 가입됩니다.
        </p>
        <p>
          Google·Kakao 계정 자체는 삭제되지 않습니다. 제공자에 대한 동의 철회는 본 절차에 포함되지
          않습니다.
        </p>
        <p className="withdraw-policy">
          로그·백업의 보관 및 파기 정책은 별도 검토 중입니다. 본 절차에서 로그·백업까지 즉시
          삭제되는 것은 보장하지 않습니다.
        </p>
        <label className="withdraw-check">
          <input
            type="checkbox"
            checked={acknowledged}
            disabled={pending}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          삭제 범위와 복구 불가 안내를 확인했으며, 회원 탈퇴에 동의합니다.
        </label>
        {error && (
          <p className="withdraw-error" role="alert">
            {error}
          </p>
        )}
        {pending && <p role="status">회원탈퇴 처리 중입니다. 잠시 기다려 주십시오.</p>}
        <div className="withdraw-actions">
          <button type="button" disabled={pending} onClick={close}>
            취소
          </button>
          <button
            type="button"
            className="withdraw-submit"
            disabled={pending || !acknowledged}
            onClick={() => void submit()}
          >
            {pending ? '처리 중…' : '회원 탈퇴'}
          </button>
        </div>
      </dialog>
    </section>
  );
}
