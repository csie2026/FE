// 화면·계정 전환 시 이전 콜백은 무효화하지만 서버 저장까지 취소된 것으로 간주하지 않는다.
export function createScopedRequest() {
  let generation = 0;
  let pending: object | null = null;
  return {
    capture() {
      const started = generation;
      return () => started === generation;
    },
    invalidate() {
      generation++;
      pending = null;
    },
    async run<T>(
      request: () => Promise<T>,
      handlers: {
        success: (value: T) => void;
        failure: (cause: unknown) => void;
        settled: () => void;
      },
    ) {
      if (pending) return false;
      const token = {};
      const started = generation;
      pending = token;
      const current = () => started === generation && pending === token;
      try {
        const result = await request();
        if (current()) handlers.success(result);
      } catch (cause) {
        if (current()) handlers.failure(cause);
      } finally {
        if (current()) {
          pending = null;
          handlers.settled();
        }
      }
      return true;
    },
  };
}
