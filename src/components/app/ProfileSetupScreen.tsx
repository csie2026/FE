import type { FormEvent } from 'react';

type Props = {
  profileCompleted: boolean;
  nickname: string;
  birthYear: string;
  birthYearOptions: number[];
  busy: boolean;
  confirmationMessage: string | null;
  onNicknameChange: (value: string) => void;
  onBirthYearChange: (value: string) => void;
  onConfirm: () => void;
  onSubmit: () => void;
};

export default function ProfileSetupScreen({
  profileCompleted,
  nickname,
  birthYear,
  birthYearOptions,
  busy,
  confirmationMessage,
  onNicknameChange,
  onBirthYearChange,
  onConfirm,
  onSubmit,
}: Props) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form className="scroll-content form-content" onSubmit={submit}>
      <h2>
        ToPeak에서 사용할
        <br />
        정보를 입력해주세요.
      </h2>
      <label>
        닉네임
        <input
          value={nickname}
          onChange={(event) => onNicknameChange(event.target.value)}
          disabled={busy || confirmationMessage !== null}
          maxLength={30}
          required
          autoComplete="nickname"
        />
        {nickname.length >= 30 && (
          <span style={{ color: '#c2410c', fontSize: '12px' }}>
            닉네임은 최대 30자까지 입력할 수 있습니다.
          </span>
        )}
      </label>
      <label>
        출생연도
        <select
          value={birthYear}
          onChange={(event) => onBirthYearChange(event.target.value)}
          autoComplete="bday-year"
          required
          disabled={busy || confirmationMessage !== null}
        >
          <option value="" disabled>
            출생연도를 선택해 주세요
          </option>
          {birthYearOptions.map((year) => (
            <option key={year} value={String(year)}>
              {year}년
            </option>
          ))}
        </select>
      </label>
      <p className="muted">출생연도를 선택해 주세요.</p>
      {confirmationMessage !== null && (
        <div role="status">
          <p>{confirmationMessage}</p>
          <button type="button" disabled={busy} onClick={onConfirm}>
            저장 결과 확인
          </button>
        </div>
      )}
      <button className="submit" disabled={busy || confirmationMessage !== null}>
        {profileCompleted ? '변경 사항 저장' : '시작하기'}
      </button>
    </form>
  );
}
