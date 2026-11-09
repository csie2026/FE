import { Capacitor, registerPlugin } from '@capacitor/core';

/** Browser/PWA, including iPhone Safari, keeps the existing browser implementation. */
export const isNativeIOS = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
export type LocationSessionKey = { userId: number; clientRequestId: string };
export type LocationAuthorization =
  'notDetermined' | 'restricted' | 'denied' | 'whenInUse' | 'always';
export type LocationFailureCode =
  | 'UNSUPPORTED_PLATFORM'
  | 'PLUGIN_UNAVAILABLE'
  | 'INVALID_ARGUMENT'
  | 'NOT_FOUND'
  | 'SESSION_CONFLICT'
  | 'SESSION_CLOSED'
  | 'PERMISSION_REQUIRED'
  | 'PERMISSION_DENIED'
  | 'LOCATION_SERVICES_DISABLED'
  | 'LOCATION_UNAVAILABLE'
  | 'SERVICE_INTERRUPTED'
  | 'STORAGE_ERROR'
  | 'NATIVE_ERROR';

export type LocationPermissions = {
  authorization: LocationAuthorization;
  servicesEnabled: boolean;
  precise: boolean;
};
export type NativeLocationStatus = LocationPermissions & {
  session:
    | (LocationSessionKey & {
        state: 'recording' | 'paused' | 'stopped' | 'interrupted' | 'error';
        startedAt: number;
        stoppedAt: number | null;
        lastRecordedAt: number | null;
        pointCount: number;
        errorCode: LocationFailureCode | null;
        activeSince: number | null;
        accumulatedMs: number;
        segment: number;
        lastSequence: number;
      })
    | null;
};
export type NativeLocationPoint = {
  sequence: number;
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracy: number;
  altitude: number | null;
  speed: number | null;
  segment: number;
};
export type ReadLocationOptions = LocationSessionKey & {
  afterSequence?: number;
  limit?: number;
};
export type NativeLocationPage = {
  points: NativeLocationPoint[];
  nextSequence: number;
  hasMore: boolean;
};

/** All times are Unix milliseconds. Reading and stopping never delete records. */
export interface BackgroundLocationPlugin {
  requestPermissions(): Promise<LocationPermissions>;
  start(options: LocationSessionKey): Promise<NativeLocationStatus>;
  pause(options: LocationSessionKey): Promise<NativeLocationStatus>;
  resume(options: LocationSessionKey): Promise<NativeLocationStatus>;
  stop(options: LocationSessionKey): Promise<NativeLocationStatus>;
  getStatus(options: LocationSessionKey): Promise<NativeLocationStatus>;
  readPoints(options: ReadLocationOptions): Promise<NativeLocationPage>;
}

export class BackgroundLocationError extends Error {
  readonly code: LocationFailureCode;
  readonly nativeCause: unknown;

  constructor(code: LocationFailureCode, message: string, nativeCause?: unknown) {
    super(message);
    this.name = 'BackgroundLocationError';
    this.code = code;
    this.nativeCause = nativeCause;
  }
}

const failureCodes = new Set<string>([
  'UNSUPPORTED_PLATFORM',
  'PLUGIN_UNAVAILABLE',
  'INVALID_ARGUMENT',
  'NOT_FOUND',
  'SESSION_CONFLICT',
  'SESSION_CLOSED',
  'PERMISSION_REQUIRED',
  'PERMISSION_DENIED',
  'LOCATION_SERVICES_DISABLED',
  'LOCATION_UNAVAILABLE',
  'SERVICE_INTERRUPTED',
  'STORAGE_ERROR',
  'NATIVE_ERROR',
]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sessionKey(options: LocationSessionKey): LocationSessionKey {
  if (
    !Number.isSafeInteger(options?.userId) ||
    options.userId <= 0 ||
    typeof options.clientRequestId !== 'string' ||
    !uuid.test(options.clientRequestId)
  ) {
    throw new BackgroundLocationError(
      'INVALID_ARGUMENT',
      'A positive user ID and UUID are required.',
    );
  }
  return { userId: options.userId, clientRequestId: options.clientRequestId.toLowerCase() };
}

/** Supply the official Capacitor exports after installation; no web GPS fallback is used. */
export type LocationRuntime = {
  isNativePlatform(): boolean;
  getPlatform(): string;
  isPluginAvailable(name: string): boolean;
  registerPlugin<T>(name: string): T;
};

export function createBackgroundLocationClient(runtime: LocationRuntime): BackgroundLocationPlugin {
  let plugin: BackgroundLocationPlugin | undefined;
  async function invoke<T>(action: (native: BackgroundLocationPlugin) => Promise<T>): Promise<T> {
    try {
      if (!runtime.isNativePlatform() || runtime.getPlatform() !== 'ios') {
        throw new BackgroundLocationError('UNSUPPORTED_PLATFORM', 'Native iOS is required.');
      }
      if (!runtime.isPluginAvailable('ToPeakBackgroundLocation')) {
        throw new BackgroundLocationError(
          'PLUGIN_UNAVAILABLE',
          'Register the iOS location plugin first.',
        );
      }
      plugin ??= runtime.registerPlugin<BackgroundLocationPlugin>('ToPeakBackgroundLocation');
      return await action(plugin);
    } catch (cause) {
      if (cause instanceof BackgroundLocationError) throw cause;
      const error = cause as { code?: unknown; message?: unknown } | null;
      const code =
        typeof error?.code === 'string' && failureCodes.has(error.code)
          ? (error.code as LocationFailureCode)
          : 'NATIVE_ERROR';
      throw new BackgroundLocationError(
        code,
        typeof error?.message === 'string' ? error.message : 'Native location operation failed.',
        cause,
      );
    }
  }
  return {
    requestPermissions: () => invoke((native) => native.requestPermissions()),
    start: (options) => invoke((native) => native.start(sessionKey(options))),
    pause: (options) => invoke((native) => native.pause(sessionKey(options))),
    resume: (options) => invoke((native) => native.resume(sessionKey(options))),
    stop: (options) => invoke((native) => native.stop(sessionKey(options))),
    getStatus: (options) => invoke((native) => native.getStatus(sessionKey(options))),
    readPoints: (options) =>
      invoke((native) => {
        const key = sessionKey(options);
        const afterSequence = options.afterSequence ?? 0;
        const limit = options.limit ?? 500;
        if (
          !Number.isSafeInteger(afterSequence) ||
          afterSequence < 0 ||
          !Number.isSafeInteger(limit) ||
          limit < 1 ||
          limit > 1000
        ) {
          throw new BackgroundLocationError(
            'INVALID_ARGUMENT',
            'Use a nonnegative cursor and limit 1–1000.',
          );
        }
        return native.readPoints({ ...key, afterSequence, limit });
      }),
  };
}

export const nativeLocation = createBackgroundLocationClient({
  isNativePlatform: () => Capacitor.isNativePlatform(),
  getPlatform: () => Capacitor.getPlatform(),
  isPluginAvailable: (name) => Capacitor.isPluginAvailable(name),
  registerPlugin,
});
