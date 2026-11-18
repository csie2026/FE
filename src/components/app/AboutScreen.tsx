import logo from '../../assets/topeak-logo.svg';

const features = [
  {
    title: '산·등산로 탐색',
    description: '산과 코스 정보를 살펴보고 나에게 맞는 산행을 준비해요.',
    path: 'M3 19 9 5l4 8 3-5 5 11H3ZM7 10l2 2 2-2',
  },
  {
    title: 'GPS 산행 기록',
    description: '위치 권한을 허용하고 이동 경로, 거리와 시간을 기록해요.',
    path: 'M6 5a2 2 0 1 0 0 .01M18 19a2 2 0 1 0 0 .01M8 5h7a4 4 0 0 1 0 8H9a3 3 0 0 0 0 6h7',
  },
  {
    title: '산행 활동 및 일지',
    description: '저장한 산행 기록을 확인하고 일지로 추억을 남겨요.',
    path: 'M5 3h14v18H5V3ZM9 8h6M9 12h6M9 16h4',
  },
  {
    title: '랭킹',
    description:
      '서버에서 산정한 점수와 회원 순위를 확인해요. 산행 점수는 인증 조건에 따라 반영돼요.',
    path: 'M8 3h8v6a4 4 0 0 1-8 0V3ZM8 5H4v2a4 4 0 0 0 4 4M16 5h4v2a4 4 0 0 1-4 4M12 13v7M8 21h8',
  },
];

export default function AboutScreen() {
  return (
    <section className="scroll-content utility-content about-content" aria-label="ToPeak 소개">
      <div className="about-intro">
        <img className="about-logo" src={logo} alt="" />
        <h1>ToPeak</h1>
        <p className="about-tagline">산을 탐색하고, 나만의 산행을 기록하다.</p>
        <p>
          산과 등산로를 탐색하고, GPS로 산행을 기록하며 나만의 산행 활동과 일지를 관리하는
          서비스입니다.
        </p>
      </div>

      <section className="about-section" aria-labelledby="about-features-title">
        <h2 id="about-features-title">주요 기능</h2>
        <div className="about-features">
          {features.map((feature) => (
            <article className="about-feature" key={feature.title}>
              <span className="about-feature-icon" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={feature.path} />
                </svg>
              </span>
              <div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="about-section" aria-labelledby="about-guide-title">
        <h2 id="about-guide-title">이용 방법</h2>
        <ol className="about-steps">
          <li>산과 코스를 선택해요.</li>
          <li>위치 권한을 허용하고 산행을 시작해요.</li>
          <li>산행을 종료하고 기록을 저장해요.</li>
          <li>마이페이지의 등산기록에서 이전 산행을 확인해요.</li>
        </ol>
      </section>

      <section className="about-section about-notice" aria-labelledby="about-notice-title">
        <h2 id="about-notice-title">이용 시 유의사항</h2>
        <ul>
          <li>GPS 정확도는 지형, 날씨, 기기 등 이용 환경에 따라 달라질 수 있어요.</li>
          <li>모바일 웹에서는 화면 잠금이나 앱 전환 시 위치 수집이 제한될 수 있어요.</li>
          <li>안전한 산행을 위해 출발 전 기상과 탐방로 상태를 확인해 주세요.</li>
        </ul>
      </section>

      <footer className="about-project">
        <h2>프로젝트 정보</h2>
        <p>2026 컴퓨터정보공학 학술제 프로젝트</p>
        <p>Team FiveGuys</p>
      </footer>
    </section>
  );
}
