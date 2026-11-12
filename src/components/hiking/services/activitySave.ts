import {
  ApiError,
  saveHikingRecord,
  type HikingActivity,
  type HikingActivityInput,
} from '../../../api.ts';
import { isValidActivityInput } from './activityValidation.ts';

export const ACTIVITY_SAVE_TIMEOUT_MS = 20_000;
export type SaveFailureKind = 'uncertain' | 'conflict' | 'authentication' | 'rejected';
export class ActivitySaveFailure extends Error {
  kind: SaveFailureKind;
  constructor(kind: SaveFailureKind, message: string) {
    super(message);
    this.kind = kind;
  }
}
const positiveId = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const sameInstant = (value: unknown, expected: string) =>
  typeof value === 'string' &&
  Number.isFinite(Date.parse(value)) &&
  Date.parse(value) === Date.parse(expected);

// 2xx 응답만으로 성공을 확정하지 않고 확정된 원본 요청과 일치하는 산행인지 확인한다.
export function confirmsSavedActivity(
  value: unknown,
  input: HikingActivityInput,
): value is HikingActivity {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<HikingActivity>;
  return (
    positiveId(record.id) &&
    record.mountainId === input.mountainId &&
    record.courseId === input.courseId &&
    sameInstant(record.startedAt, input.startedAt) &&
    sameInstant(record.endedAt, input.endedAt) &&
    record.distanceMeters === input.distanceMeters &&
    record.elapsedMs === input.elapsedMs &&
    typeof record.completed === 'boolean' &&
    typeof record.mountainName === 'string' &&
    record.mountainName.length > 0 &&
    typeof record.hikingDate === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(record.hikingDate) &&
    (record.journalId === null || positiveId(record.journalId))
  );
}
export function describeSaveFailure(cause: unknown): ActivitySaveFailure {
  if (cause instanceof ActivitySaveFailure) return cause;
  if (cause instanceof ApiError) {
    if (cause.status === 413)
      return new ActivitySaveFailure(
        'rejected',
        'GPS 요청이 2MiB 한도를 초과했습니다. 증거는 보존됩니다.',
      );
    if (cause.status === 400)
      return new ActivitySaveFailure(
        'rejected',
        '산행의 GPS 증거·거리·시각을 확인하지 못했습니다. 임시 기록은 보존됩니다. 기록을 확인한 뒤 다시 시도해주세요.',
      );
    if (cause.status === 409 && cause.code === 'duplicate_hiking_activity')
      return new ActivitySaveFailure(
        'conflict',
        '같은 시간의 산행이 이미 저장되어 있습니다. 저장된 기록을 확인해 주세요. 임시 기록은 보존됩니다.',
      );
    if (cause.status === 409)
      return new ActivitySaveFailure(
        'conflict',
        '기존 서버 기록과 저장 내용이 충돌했습니다. 임시 기록은 보관 중입니다. 저장된 산행을 확인해주세요.',
      );
    if (cause.status === 401 || cause.status === 403)
      return new ActivitySaveFailure(
        'authentication',
        '로그인 또는 계정 상태를 확인해주세요. 산행을 기록한 같은 회원으로 로그인해야 저장할 수 있습니다. 임시 기록은 보관 중입니다.',
      );
    if (cause.status >= 400 && cause.status < 500 && ![408, 429].includes(cause.status))
      return new ActivitySaveFailure(
        'rejected',
        '서버가 저장 요청을 받아들이지 못했습니다. 임시 기록은 보관 중입니다. 저장된 산행을 확인해주세요.',
      );
  }
  return new ActivitySaveFailure(
    'uncertain',
    '저장 여부를 확인하지 못했습니다. 임시 기록은 보관 중이며, 같은 기록으로 다시 시도할 수 있습니다.',
  );
}
export async function submitPendingActivity(
  input: HikingActivityInput,
  userId: number,
  signal?: AbortSignal,
  timeoutMs = ACTIVITY_SAVE_TIMEOUT_MS,
  allowLegacy = false,
): Promise<HikingActivity> {
  if (!positiveId(userId)) throw describeSaveFailure(new ApiError(401, '계정 확인 필요'));
  if (!isValidActivityInput(input, Date.now(), allowLegacy))
    throw new ActivitySaveFailure(
      'rejected',
      '산행 기록의 시각·거리·시간 또는 산·코스 정보를 확인할 수 없어 전송하지 않았습니다. 임시 기록은 보관 중입니다.',
    );
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let onAbort: () => void = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => {
      controller.abort();
      reject(new DOMException('요청이 취소되었습니다.', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    timeout = setTimeout(() => {
      controller.abort();
      reject(
        new ActivitySaveFailure(
          'uncertain',
          '저장 응답 시간이 초과되어 결과를 확인하지 못했습니다. 임시 기록은 보관 중입니다. 같은 기록으로 다시 시도해주세요.',
        ),
      );
    }, timeoutMs);
  });
  try {
    const record = await Promise.race([
      saveHikingRecord(input, controller.signal, userId),
      cancelled,
    ]);
    if (!confirmsSavedActivity(record, input))
      throw new ActivitySaveFailure(
        'uncertain',
        '서버 응답에서 이 산행의 저장을 확인하지 못했습니다. 임시 기록은 보관 중입니다. 같은 기록으로 다시 시도해주세요.',
      );
    return record;
  } catch (cause) {
    if (signal?.aborted) throw new DOMException('요청이 취소되었습니다.', 'AbortError');
    throw describeSaveFailure(cause);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}
