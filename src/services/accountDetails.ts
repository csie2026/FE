export function loginProviderLabel(provider?: string | null): string {
  if (provider === 'google') return '구글';
  if (provider === 'kakao') return '카카오';
  return '확인 불가';
}

export function formatJoinedDate(joinedAt?: string | null): string {
  if (!joinedAt || !/(Z|[+-]\d{2}:\d{2})$/.test(joinedAt)) return '가입일 정보 없음';
  const instant = new Date(joinedAt);
  if (!Number.isFinite(instant.getTime())) return '가입일 정보 없음';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}년 ${value('month')}월 ${value('day')}일`;
}
