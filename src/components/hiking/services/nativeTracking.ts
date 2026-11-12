import {
  BackgroundLocationError,
  nativeLocation,
  type BackgroundLocationPlugin,
  type NativeLocationPage,
  type NativeLocationPoint,
  type NativeLocationStatus,
} from '../../../native/backgroundLocation.ts';
import { GPS_FILTER } from '../config.ts';
import { acceptTrackPoint, hasReachedSummit, isUsablePoint } from '../trackUtils.ts';
import type { GpsPoint, HikingCourse } from '../types.ts';
import { assertTrackingCapacity, RecoveryCapacityError } from './sessionTracking.ts';
import {
  completeSession,
  MAX_RECOVERY_POINTS,
  validateDraft,
  type RecoveryDraft,
  type Session,
} from './sessionRecovery.ts';

const invalid = (message: string): never => {
  throw new BackgroundLocationError('NATIVE_ERROR', message);
};
const integer = (value: unknown, minimum = 0): value is number =>
  Number.isSafeInteger(value) && (value as number) >= minimum;
const time = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export function nativeCheckpoint(baseElapsedMs = 0): NonNullable<Session['native']> {
  return { cursor: 0, lastTimestamp: null, segment: -1, baseElapsedMs };
}

/** 수집 중 상태나 완료 요청을 확정하기 전에 브리지 응답 데이터를 검증한다. */
export function checkedNativeStatus(
  status: NativeLocationStatus,
  session: Session,
  userId: number,
  now = Date.now(),
) {
  const n = status?.session;
  if (
    !n ||
    typeof status.servicesEnabled !== 'boolean' ||
    typeof status.precise !== 'boolean' ||
    !['notDetermined', 'restricted', 'denied', 'whenInUse', 'always'].includes(
      status.authorization,
    ) ||
    n.userId !== userId ||
    typeof n.clientRequestId !== 'string' ||
    n.clientRequestId.toLowerCase() !== session.clientRequestId?.toLowerCase() ||
    !['recording', 'paused', 'stopped', 'interrupted', 'error'].includes(n.state) ||
    !time(n.startedAt) ||
    n.startedAt < session.startedAt! ||
    n.startedAt > now ||
    !integer(n.accumulatedMs) ||
    !integer(n.segment) ||
    !integer(n.lastSequence) ||
    !integer(n.pointCount) ||
    !(
      n.stoppedAt === null ||
      (time(n.stoppedAt) && n.stoppedAt >= n.startedAt && n.stoppedAt <= now)
    ) ||
    !(
      n.lastRecordedAt === null ||
      (time(n.lastRecordedAt) && n.lastRecordedAt >= n.startedAt && n.lastRecordedAt <= now)
    ) ||
    (n.state === 'recording'
      ? !time(n.activeSince) || n.activeSince < n.startedAt || n.activeSince > now
      : n.activeSince !== null) ||
    (n.state === 'stopped' && n.stoppedAt === null) ||
    (n.state === 'recording' &&
      (!status.servicesEnabled ||
        !['whenInUse', 'always'].includes(status.authorization) ||
        (n.errorCode !== null && n.errorCode !== 'LOCATION_UNAVAILABLE'))) ||
    (session.native?.cursor ?? 0) > n.lastSequence
  ) {
    return invalid('네이티브 GPS 세션 또는 브리지 응답을 확인할 수 없습니다. 기록은 보존했습니다.');
  }
  const base = session.native?.baseElapsedMs ?? session.accumulatedMs;
  if (
    base + n.accumulatedMs + (n.activeSince === null ? 0 : now - n.activeSince) >
    now - session.startedAt!
  ) {
    return invalid('네이티브 활동 시간이 산행 범위를 벗어났습니다.');
  }
  return n;
}

export function sessionWithNativeStatus(
  session: Session,
  status: NativeLocationStatus,
  userId: number,
  now = Date.now(),
): Session {
  const n = checkedNativeStatus(status, session, userId, now);
  if (session.state === 'COMPLETED') return session;
  return {
    ...session,
    native: session.native ?? nativeCheckpoint(session.accumulatedMs),
    state: n.state === 'recording' ? 'TRACKING' : 'PAUSED',
    activeSince: n.activeSince,
    accumulatedMs: (session.native?.baseElapsedMs ?? session.accumulatedMs) + n.accumulatedMs,
  };
}

export function nativePoint(point: NativeLocationPoint): GpsPoint {
  return {
    lat: point.latitude,
    lng: point.longitude,
    latitude: point.latitude,
    longitude: point.longitude,
    timestamp: point.timestamp,
    accuracy: point.accuracy,
    altitude: point.altitude,
    speed: point.speed,
  };
}

/** 표시용 위치는 최신성과 정확도로 판단하며 경로 기록용 이동 필터를 통과할 필요는 없다. */
export function latestNativeDisplayPosition(
  previous: GpsPoint | null,
  candidates: readonly GpsPoint[],
  now = Date.now(),
): GpsPoint | null {
  let latest = previous && isUsablePoint(previous, now) ? previous : null;
  for (const point of candidates) {
    if (isUsablePoint(point, now) && (!latest || point.timestamp > latest.timestamp))
      latest = point;
  }
  return latest;
}

/** 처리 순서는 sequence를 기준으로 하며 이미 채택한 경로를 소급 수정하지 않는다. */
export function mergeNativePage(
  session: Session,
  page: NativeLocationPage,
  course: HikingCourse,
  now = Date.now(),
  checkCapacity?: (candidate: Session) => void,
): Session {
  if (session.state === 'COMPLETED' || !session.native)
    return invalid('종료 기록에는 좌표를 추가할 수 없습니다.');
  if (
    !page ||
    !Array.isArray(page.points) ||
    page.points.length > 1000 ||
    typeof page.hasMore !== 'boolean' ||
    !integer(page.nextSequence)
  )
    return invalid('잘못된 GPS 페이지입니다.');
  let next = {
    ...session,
    native: { ...session.native },
    segments: session.segments.map((s) => [...s]),
  };
  // 기존 웹 경로가 네이티브 체크포인트보다 먼저 존재할 수 있으므로 더 오래된 표본을 뒤에 붙이지 않는다.
  const lastAcceptedAt = session.segments.flat().at(-1)?.timestamp;
  if (
    lastAcceptedAt !== undefined &&
    (next.native.lastTimestamp === null || lastAcceptedAt > next.native.lastTimestamp)
  ) {
    next.native.lastTimestamp = lastAcceptedAt;
  }
  let count = next.segments.reduce((n, segment) => n + segment.length, 0);
  for (const raw of page.points) {
    if (
      !raw ||
      !integer(raw.sequence, 1) ||
      raw.sequence <= next.native.cursor ||
      !integer(raw.segment)
    ) {
      return invalid('GPS sequence 또는 구간 순서가 올바르지 않습니다.');
    }
    next.native.cursor = raw.sequence;
    // 거부한 표본도 처리하되 호출자가 영속 저장에 성공한 경우에만 커서를 갱신한다.
    if (
      !time(raw.timestamp) ||
      raw.timestamp < session.startedAt! ||
      raw.timestamp > now ||
      raw.segment < next.native.segment ||
      (next.native.lastTimestamp !== null && raw.timestamp <= next.native.lastTimestamp)
    )
      continue;
    next.native.lastTimestamp = raw.timestamp;
    if (raw.segment !== next.native.segment) {
      if (next.segments.at(-1)?.length) next.segments.push([]);
      next.native.segment = raw.segment;
    }
    if (!(raw.altitude === null || time(raw.altitude)) || !(raw.speed === null || time(raw.speed)))
      continue;
    const point = nativePoint(raw);
    const previous = next.segments.at(-1)?.at(-1);
    const gap = previous && point.timestamp - previous.timestamp > GPS_FILTER.maxGapMs;
    // 과거 표본은 측정 시각을 기준으로 검사하며 현재 시각의 15초 최신성 조건을 적용하지 않는다.
    if (!acceptTrackPoint(point, gap ? undefined : previous, point.timestamp)) continue;
    if (count >= MAX_RECOVERY_POINTS || next.trackingStopReason) {
      next.trackingStopReason ??= 'point-limit';
      continue;
    }
    if (gap) next.segments.push([]);
    next.segments.at(-1)!.push(point);
    try {
      checkCapacity?.(next);
    } catch (cause) {
      if (!(cause instanceof RecoveryCapacityError)) throw cause;
      next.segments.at(-1)!.pop();
      if (gap) next.segments.pop();
      next.trackingStopReason = 'capacity-limit';
      continue;
    }
    next.reachedSummit ||= hasReachedSummit(point, course.summitPoint, point.timestamp);
    count++;
    if (count === MAX_RECOVERY_POINTS) next.trackingStopReason = 'point-limit';
  }
  if (page.nextSequence !== next.native.cursor)
    return invalid('GPS 페이지 cursor가 일치하지 않습니다.');
  return next;
}

/** 호출자는 작업을 순차 실행하고 경로와 거부 표본 커서를 하나의 복구 기록으로 저장한다. */
export async function synchronizeNativeSession(
  session: Session,
  userId: number,
  course: HikingCourse,
  ownerToken: string,
  commit: (next: Session) => void,
  client: BackgroundLocationPlugin = nativeLocation,
  assertOwnership: () => void = () => {},
): Promise<{ session: Session; status: NativeLocationStatus; position: GpsPoint | null }> {
  if (session.state === 'COMPLETED') return invalid('확정된 저장 요청은 변경할 수 없습니다.');
  const key = { userId, clientRequestId: session.clientRequestId! };
  let status = await client.getStatus(key);
  let n = checkedNativeStatus(status, session, userId);
  let next = sessionWithNativeStatus(session, status, userId);
  let position: GpsPoint | null = null;
  const target = n.lastSequence; // 조회 상한을 고정해 계속 도착하는 새 좌표를 끝없이 따라가지 않는다.
  while (next.native!.cursor < target) {
    const page = await client.readPoints({
      ...key,
      afterSequence: next.native!.cursor,
      limit: 500,
    });
    // 상태 조회 시점의 범위로 자르기 전에 원본 페이지 전체를 검증한다.
    mergeNativePage(next, page, course);
    const points = page.points.filter((p) => p.sequence <= target);
    if (!points.length) return invalid('GPS 페이지가 진행되지 않았습니다.');
    if (
      points.some(
        (p) =>
          p.segment > n.segment ||
          (time(p.timestamp) &&
            (p.timestamp < n.startedAt || (n.stoppedAt !== null && p.timestamp > n.stoppedAt))),
      )
    ) {
      return invalid('GPS 좌표가 네이티브 수집 구간을 벗어났습니다.');
    }
    const bounded = { points, nextSequence: points.at(-1)!.sequence, hasMore: false };
    let merged = mergeNativePage(next, bounded, course);
    try {
      assertTrackingCapacity(merged, course, userId, ownerToken);
    } catch (cause) {
      if (!(cause instanceof RecoveryCapacityError)) throw cause;
      // 용량 한도에 걸치는 페이지만 표본별로 검사하고 나머지 누적 표본은 페이지 단위로 처리한다.
      merged = mergeNativePage(next, bounded, course, Date.now(), (candidate) =>
        assertTrackingCapacity(candidate, course, userId, ownerToken),
      );
      assertTrackingCapacity(merged, course, userId, ownerToken);
    }
    commit(merged);
    next = merged;
    position = latestNativeDisplayPosition(position, points.map(nativePoint));
  }
  if (next.trackingStopReason && n.state === 'recording') {
    assertOwnership();
    status = await client.pause(key);
    checkedNativeStatus(status, next, userId);
  }
  // 페이지 조회 중 권한·서비스 오류가 생길 수 있으므로 이전 조회 상태를 그대로 화면에 반영하지 않는다.
  status = await client.getStatus(key);
  next = sessionWithNativeStatus(next, status, userId);
  commit(next);
  return { session: next, status, position };
}

export type NativeAction = 'start' | 'pause' | 'resume' | 'complete' | 'sync';

/** 이 작업이 성공한 뒤에만 웹 임시 기록을 삭제할 수 있으며 네이티브 원본은 유지한다. */
export async function stopNativeForDiscard(
  expected: RecoveryDraft,
  userId: number,
  readCurrent: () => unknown,
  client: BackgroundLocationPlugin = nativeLocation,
) {
  const assertCurrent = () => {
    const current = readCurrent();
    if (
      !validateDraft(current, userId) ||
      current.clientRequestId !== expected.clientRequestId ||
      current.ownerToken !== expected.ownerToken
    )
      throw new Error('기록 소유권이 변경되어 삭제하지 않았습니다. 다시 확인해주세요.');
  };
  assertCurrent();
  const status = await client.stop({ userId, clientRequestId: expected.clientRequestId });
  if (!status || status.session === undefined)
    throw new Error('GPS 종료 응답을 확인하지 못해 삭제하지 않았습니다.');
  const n = status.session;
  if (
    n &&
    (n.userId !== userId ||
      typeof n.clientRequestId !== 'string' ||
      n.clientRequestId.toLowerCase() !== expected.clientRequestId.toLowerCase() ||
      n.state !== 'stopped')
  )
    throw new Error('GPS 종료를 확인하지 못해 삭제하지 않았습니다.');
  assertCurrent();
}

/** 네이티브 중지와 모든 조회 페이지의 영속 저장이 끝나기 전에는 pendingInput을 만들지 않는다. */
export async function updateNativeSession(
  action: NativeAction,
  session: Session,
  userId: number,
  course: HikingCourse,
  ownerToken: string,
  commit: (next: Session) => void,
  client: BackgroundLocationPlugin = nativeLocation,
  assertOwnership: () => void = () => {},
) {
  if (session.state === 'COMPLETED') {
    // 구버전을 포함해 이미 확정된 요청 본문은 다시 생성하지 않는다.
    return { session, status: null, position: null };
  }
  const key = { userId, clientRequestId: session.clientRequestId! };
  assertOwnership();
  if (action === 'start' || action === 'resume') {
    await client.requestPermissions();
    const before = await client.getStatus(key);
    assertOwnership();
    const status =
      before.session === null
        ? await client.start(key)
        : action === 'start'
          ? await client.start(key)
          : await client.resume(key);
    if (checkedNativeStatus(status, session, userId).state !== 'recording') {
      throw new BackgroundLocationError(
        'SESSION_CLOSED',
        '네이티브 GPS 수집이 시작되지 않았습니다.',
      );
    }
  } else if (action === 'pause') {
    const status = await client.pause(key);
    if (checkedNativeStatus(status, session, userId).state === 'recording') {
      return invalid('네이티브 GPS 일시정지를 확인하지 못했습니다.');
    }
  } else if (action === 'complete') {
    const status = await client.stop(key);
    if (checkedNativeStatus(status, session, userId).state !== 'stopped') {
      return invalid('네이티브 GPS 종료를 확인하지 못했습니다.');
    }
  }
  const result = await synchronizeNativeSession(
    session,
    userId,
    course,
    ownerToken,
    commit,
    client,
    assertOwnership,
  );
  if (action === 'complete') {
    if (result.status.session?.state !== 'stopped')
      return invalid('GPS 종료 상태가 변경되었습니다.');
    if (result.session.native!.cursor !== result.status.session.lastSequence)
      return invalid('종료 후 GPS 좌표가 변경되었습니다. 마지막 기록을 다시 확인해주세요.');
    const completed = completeSession(result.session, course, result.status.session.stoppedAt!);
    commit(completed);
    return { session: completed, status: result.status, position: result.position };
  }
  return result;
}
