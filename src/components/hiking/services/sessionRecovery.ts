import type { HikingActivityInput } from "../../../api.ts";
import type { GpsPoint, HikingCourse } from "../types.ts";
import { trackDistance, isUsablePoint } from "../trackUtils.ts";
import { isValidActivityInput } from "./activityValidation.ts";

export const RECOVERY_VERSION = 2;
export const RECOVERY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_RECOVERY_POINTS = 10_000;
export const MAX_RECOVERY_BYTES = 1_000_000;
export const recoveryKey = (userId: number) =>
  `topeak.hikingSession.v1.${userId}`;
export type TrackingStopReason =
  "point-limit" | "capacity-limit" | "storage-error";
export type Session = {
  startedAt: number | null;
  endedAt: number | null;
  clientRequestId: string | null;
  state: "READY" | "TRACKING" | "PAUSED" | "COMPLETED";
  segments: GpsPoint[][];
  activeSince: number | null;
  accumulatedMs: number;
  reachedSummit: boolean;
  pendingInput: HikingActivityInput | null;
  trackingStopReason?: TrackingStopReason | null;
};
type CompactPoint = [
  number,
  number,
  number,
  number,
  number | null,
  number | null,
];
export type RecoveryDraft = {
  version: 1 | 2;
  userId: number;
  updatedAt: number;
  ownerToken: string;
  mountainId: number;
  courseId: number;
  mountainName: string;
  courseName: string;
  startedAt: number;
  endedAt: number | null;
  clientRequestId: string;
  state: "PAUSED" | "COMPLETED";
  accumulatedMs: number;
  reachedSummit: boolean;
  distanceMeters: number;
  segments: CompactPoint[][];
  pendingInput: Omit<HikingActivityInput, "gpsSegments"> | null;
  trackingStopReason?: TrackingStopReason | null;
};
export type RecoveryRead =
  | { kind: "none" }
  | { kind: "ready"; draft: RecoveryDraft }
  | { kind: "error"; message: string };
export type RecoveryContext = { draft: RecoveryDraft; ownerToken: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const finite = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);
const id = (n: unknown): n is number =>
  finite(n) && Number.isSafeInteger(n) && n > 0;
export const initialSession = (): Session => ({
  startedAt: null,
  endedAt: null,
  clientRequestId: null,
  state: "READY",
  segments: [],
  activeSince: null,
  accumulatedMs: 0,
  reachedSummit: false,
  pendingInput: null,
});
export function pauseSession(session: Session, now = Date.now()): Session {
  if (session.state !== "TRACKING") return session;
  return {
    ...session,
    state: "PAUSED",
    activeSince: null,
    accumulatedMs:
      session.accumulatedMs + Math.max(0, now - session.activeSince!),
  };
}
export function activityInput(
  session: Session,
  course: Pick<HikingCourse, "mountainId" | "courseId">,
): HikingActivityInput {
  // Keep one originally filtered point for score eligibility, never a map-snapped coordinate.
  const point = session.segments
    .flat()
    .find(
      (p) =>
        isUsablePoint(p, p.timestamp) &&
        p.timestamp >= session.startedAt! &&
        p.timestamp <= session.endedAt!,
    );
  return {
    mountainId: Number(course.mountainId),
    courseId: Number(course.courseId),
    startedAt: new Date(session.startedAt!).toISOString(),
    endedAt: new Date(session.endedAt!).toISOString(),
    distanceMeters: trackDistance(session.segments),
    elapsedMs: session.accumulatedMs,
    completed: session.reachedSummit,
    clientRequestId: session.clientRequestId!,
    ...(point
      ? {
          gpsEvidence: {
            latitude: point.lat,
            longitude: point.lng,
            accuracyMeters: point.accuracy,
            recordedAt: new Date(point.timestamp).toISOString(),
          },
        }
      : {}),
    gpsSegments: evidence(session.segments),
  };
}
export function completeSession(
  session: Session,
  course: Pick<HikingCourse, "mountainId" | "courseId">,
  now = Date.now(),
): Session {
  if (session.state !== "TRACKING" && session.state !== "PAUSED")
    return session;
  const ended = {
    ...pauseSession(session, now),
    state: "COMPLETED" as const,
    endedAt: now,
  };
  const pendingInput = activityInput(ended, course);
  freezeEvidence(pendingInput);
  return { ...ended, pendingInput };
}
export function sessionFromDraft(draft: RecoveryDraft): Session {
  const restored: Session = {
    startedAt: draft.startedAt,
    endedAt: draft.endedAt,
    clientRequestId: draft.clientRequestId,
    state: draft.state,
    activeSince: null,
    accumulatedMs: draft.accumulatedMs,
    reachedSummit: draft.reachedSummit,
    trackingStopReason:
      draft.trackingStopReason ??
      (draft.state === "PAUSED" &&
      draft.segments.reduce((n, s) => n + s.length, 0) >= MAX_RECOVERY_POINTS
        ? "point-limit"
        : null),
    pendingInput:
      draft.pendingInput &&
      (draft.version === 1
        ? draft.pendingInput
        : {
            ...draft.pendingInput,
            gpsSegments: evidenceFromCompact(draft.segments),
          }),
    segments: draft.segments.map((segment) =>
      segment.map(([lat, lng, timestamp, accuracy, altitude, speed]) => ({
        lat,
        lng,
        latitude: lat,
        longitude: lng,
        timestamp,
        accuracy,
        altitude,
        speed,
      })),
    ),
  };
  if (restored.pendingInput) freezeEvidence(restored.pendingInput);
  return restored;
}
export function draftFromSession(
  session: Session,
  course: Pick<
    HikingCourse,
    "mountainId" | "courseId" | "mountainName" | "courseName"
  >,
  userId: number,
  ownerToken: string,
  now = Date.now(),
): RecoveryDraft {
  const paused = pauseSession(session, now);
  return {
    version:
      paused.state === "COMPLETED" &&
      paused.pendingInput?.gpsSegments === undefined
        ? 1
        : 2,
    userId,
    updatedAt: now,
    ownerToken,
    mountainId: Number(course.mountainId),
    courseId: Number(course.courseId),
    mountainName: course.mountainName,
    courseName: course.courseName,
    startedAt: paused.startedAt!,
    endedAt: paused.endedAt,
    clientRequestId: paused.clientRequestId!,
    state: paused.state === "COMPLETED" ? "COMPLETED" : "PAUSED",
    accumulatedMs: paused.accumulatedMs,
    reachedSummit: paused.reachedSummit,
    distanceMeters:
      paused.pendingInput?.distanceMeters ?? trackDistance(paused.segments),
    pendingInput: paused.pendingInput ? summaryOnly(paused.pendingInput) : null,
    ...(paused.trackingStopReason
      ? { trackingStopReason: paused.trackingStopReason }
      : {}),
    segments: paused.segments.map((segment) =>
      segment.map((p) => [
        p.lat,
        p.lng,
        p.timestamp,
        p.accuracy,
        p.altitude,
        p.speed,
      ]),
    ),
  };
}
export function validateDraft(
  value: unknown,
  userId: number,
  now = Date.now(),
): value is RecoveryDraft {
  if (!value || typeof value !== "object") return false;
  const d = value as RecoveryDraft;
  if (
    ![1, RECOVERY_VERSION].includes(d.version) ||
    d.userId !== userId ||
    !id(d.userId) ||
    !id(d.mountainId) ||
    !id(d.courseId) ||
    !uuid.test(d.clientRequestId) ||
    !uuid.test(d.ownerToken) ||
    typeof d.mountainName !== "string" ||
    !d.mountainName.length ||
    d.mountainName.length > 200 ||
    typeof d.courseName !== "string" ||
    !d.courseName.length ||
    d.courseName.length > 200 ||
    !finite(d.startedAt) ||
    d.startedAt <= 0 ||
    !finite(d.updatedAt) ||
    d.updatedAt > now + 5000 ||
    d.updatedAt < d.startedAt ||
    !Number.isSafeInteger(d.accumulatedMs) ||
    d.accumulatedMs < 0 ||
    d.accumulatedMs > d.updatedAt - d.startedAt ||
    typeof d.reachedSummit !== "boolean" ||
    !finite(d.distanceMeters) ||
    d.distanceMeters < 0 ||
    !["PAUSED", "COMPLETED"].includes(d.state) ||
    !(
      d.trackingStopReason == null ||
      ["point-limit", "capacity-limit", "storage-error"].includes(
        d.trackingStopReason,
      )
    ) ||
    !Array.isArray(d.segments) ||
    d.segments.length > MAX_RECOVERY_POINTS
  )
    return false;
  let points = 0;
  let previousTime = d.startedAt;
  for (const segment of d.segments) {
    if (!Array.isArray(segment)) return false;
    points += segment.length;
    if (points > MAX_RECOVERY_POINTS) return false;
    for (const p of segment) {
      if (
        !Array.isArray(p) ||
        p.length !== 6 ||
        !finite(p[0]) ||
        Math.abs(p[0]) > 90 ||
        !finite(p[1]) ||
        Math.abs(p[1]) > 180 ||
        !finite(p[2]) ||
        p[2] < previousTime ||
        p[2] > d.updatedAt ||
        !finite(p[3]) ||
        p[3] < 0 ||
        !(p[4] === null || finite(p[4])) ||
        !(p[5] === null || finite(p[5]))
      )
        return false;
      previousTime = p[2];
    }
  }
  if (d.state === "PAUSED")
    return (
      d.endedAt === null &&
      d.pendingInput === null &&
      Math.abs(
        trackDistance(sessionFromDraft(d).segments) - d.distanceMeters,
      ) <= 0.0001
    );
  if (
    !finite(d.endedAt) ||
    d.endedAt < previousTime ||
    d.endedAt > d.updatedAt ||
    d.accumulatedMs > d.endedAt - d.startedAt
  )
    return false;
  const expected: HikingActivityInput = {
    mountainId: d.mountainId,
    courseId: d.courseId,
    startedAt: new Date(d.startedAt).toISOString(),
    endedAt: new Date(d.endedAt).toISOString(),
    distanceMeters: d.distanceMeters,
    elapsedMs: d.accumulatedMs,
    completed: d.reachedSummit,
    clientRequestId: d.clientRequestId,
  };
  const body = d.pendingInput;
  // An ended pre-upgrade request has no evidence: preserve its UUID and exact original body.
  if (body?.gpsEvidence !== undefined) expected.gpsEvidence = body.gpsEvidence;
  return (
    !!body &&
    isValidActivityInput(
      d.version === 1
        ? body
        : { ...body, gpsSegments: evidenceFromCompact(d.segments) },
      now,
      d.version === 1,
    ) &&
    Object.keys(body).length === Object.keys(expected).length &&
    Object.keys(expected).every(
      (key) =>
        body[key as keyof typeof body] ===
        expected[key as keyof HikingActivityInput],
    )
  );
}
export function readRecovery(
  userId: number,
  now = Date.now(),
  storage?: Storage,
): RecoveryRead {
  try {
    storage = storage ?? localStorage;
    const text = storage.getItem(recoveryKey(userId));
    if (text === null) return { kind: "none" };
    if (new TextEncoder().encode(text).length > MAX_RECOVERY_BYTES)
      throw new Error("oversize");
    const draft: unknown = JSON.parse(text);
    if (!validateDraft(draft, userId, now))
      return {
        kind: "error",
        message:
          "산행 임시 기록이 손상되었거나 형식이 맞지 않습니다. 해당 임시 기록을 삭제한 뒤 다시 시작해주세요.",
      };
    if (now - draft.updatedAt > RECOVERY_TTL_MS) {
      return {
        kind: "error",
        message:
          "마지막 저장 후 7일이 지나 자동 복구할 수 없습니다. 임시 기록은 삭제하지 않고 보존했습니다.",
      };
    }
    return { kind: "ready", draft };
  } catch {
    return {
      kind: "error",
      message:
        "산행 임시 저장소에 접근할 수 없습니다. 브라우저 저장 공간과 설정을 확인해주세요.",
    };
  }
}
export function writeRecovery(
  draft: RecoveryDraft,
  mode: "create" | "claim" | "update",
  storage: Storage = localStorage,
): void {
  const current = readRecovery(draft.userId, Date.now(), storage);
  if (mode === "create" && current.kind !== "none")
    throw new Error(
      "복구 가능한 산행이 남아 있습니다. 기존 산행을 먼저 확인해주세요.",
    );
  if (
    mode !== "create" &&
    (current.kind !== "ready" ||
      current.draft.clientRequestId !== draft.clientRequestId ||
      (mode === "update" && current.draft.ownerToken !== draft.ownerToken))
  )
    throw new Error(
      "다른 창에서 산행 기록이 변경되었습니다. 등산 메뉴에서 복구 기록을 확인해주세요.",
    );
  if (
    current.kind === "ready" &&
    current.draft.state === "COMPLETED" &&
    (draft.state !== "COMPLETED" ||
      JSON.stringify(draft.pendingInput) !==
        JSON.stringify(current.draft.pendingInput) ||
      JSON.stringify(draft.segments) !== JSON.stringify(current.draft.segments))
  )
    throw new Error(
      "종료된 산행은 다시 진행하거나 저장 내용을 변경할 수 없습니다. 저장 재시도를 선택해주세요.",
    );
  if (!validateDraft(draft, draft.userId))
    throw new Error(
      "산행 기록이 저장 한도를 넘었거나 유효하지 않습니다. 현재 기록을 종료해 저장해주세요.",
    );
  const text = JSON.stringify(draft);
  if (new TextEncoder().encode(text).length > MAX_RECOVERY_BYTES)
    throw new Error(
      "산행 임시 기록이 저장 용량 한도를 넘었습니다. 현재 기록을 종료해 저장해주세요.",
    );
  try {
    storage.setItem(recoveryKey(draft.userId), text);
  } catch {
    throw new Error(
      "산행 자동 복구 저장에 실패해 일시정지했습니다. 화면을 닫지 말고 저장 재시도 또는 산행 종료를 선택해주세요.",
    );
  }
}
export function removeRecovery(
  userId: number,
  clientRequestId: string,
  ownerToken?: string,
  storage: Storage = localStorage,
): void {
  const value = storage.getItem(recoveryKey(userId));
  if (value === null) return;
  const draft = JSON.parse(value) as RecoveryDraft;
  if (
    draft.clientRequestId !== clientRequestId ||
    (ownerToken && draft.ownerToken !== ownerToken)
  )
    throw new Error(
      "다른 산행 기록이므로 삭제하지 않았습니다. 등산 메뉴에서 다시 확인해주세요.",
    );
  storage.removeItem(recoveryKey(userId));
}

function evidence(segments: GpsPoint[][]) {
  return segments.map((segment) =>
    segment.map((p) => ({
      lat: p.lat,
      lng: p.lng,
      measuredAt: new Date(p.timestamp).toISOString(),
      accuracyMeters: p.accuracy,
    })),
  );
}
function evidenceFromCompact(segments: CompactPoint[][]) {
  return segments.map((segment) =>
    segment.map(([lat, lng, timestamp, accuracyMeters]) => ({
      lat,
      lng,
      measuredAt: new Date(timestamp).toISOString(),
      accuracyMeters,
    })),
  );
}
function summaryOnly(input: HikingActivityInput) {
  const { gpsSegments: _gps, ...summary } = input;
  return summary;
}

function freezeEvidence(input: HikingActivityInput) {
  if (input.gpsEvidence) Object.freeze(input.gpsEvidence);
  input.gpsSegments?.forEach((segment) => {
    segment.forEach(Object.freeze);
    Object.freeze(segment);
  });
  if (input.gpsSegments) Object.freeze(input.gpsSegments);
  Object.freeze(input);
}
