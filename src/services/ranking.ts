import { getRankingSummary, type RankingSummary } from '../api.ts';

// 어댑터가 요청 취소를 무시해도 콜백은 화면에 연결된 회원의 요청에만 적용한다.
export function startRankingRequest(
  userId: number,
  handlers: {
    success: (summary: RankingSummary) => void;
    failure: (cause: unknown) => void;
  },
) {
  const controller = new AbortController();
  void getRankingSummary(controller.signal)
    .then((data) => {
      if (controller.signal.aborted) return;
      if (data.mine !== null && data.mine.userId !== userId)
        throw new Error('로그인한 회원의 순위를 확인할 수 없습니다.');
      handlers.success(data);
    })
    .catch((cause: unknown) => {
      if (!controller.signal.aborted) handlers.failure(cause);
    });
  return () => controller.abort();
}
