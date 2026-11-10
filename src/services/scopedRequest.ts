// A navigation/account change invalidates callbacks, not the server write.
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
