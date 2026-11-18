import logo from '../../assets/topeak-logo.svg';

type Props = {
  busy: boolean;
};

function BrandMark() {
  return (
    <div className="brand-mark" aria-label="ToPeak 로고">
      <img src={logo} alt="" />
      <strong>ToPeak</strong>
    </div>
  );
}

export default function LoginScreen({ busy }: Props) {
  return (
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
  );
}
