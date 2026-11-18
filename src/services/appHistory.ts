import { readHikingSelection } from '../components/hiking/services/hikingNavigation.ts';

export type Screen =
  | 'login'
  | 'explore'
  | 'detail'
  | 'hikingTracking'
  | 'diary'
  | 'journalDetail'
  | 'write'
  | 'profile'
  | 'accountSettings'
  | 'hikingRecords'
  | 'ranking'
  | 'setup'
  | 'myJournals'
  | 'publicProfile'
  | 'favorites'
  | 'conquered'
  | 'about';

const initialScreens: Screen[] = [
  'hikingTracking',
  'explore',
  'detail',
  'diary',
  'profile',
  'accountSettings',
  'hikingRecords',
  'ranking',
  'setup',
  'myJournals',
  'favorites',
  'conquered',
  'about',
];

const historyScreens: Screen[] = [...initialScreens, 'journalDetail', 'write', 'publicProfile'];

export function getInitialHistoryScreen(screen: unknown): Screen | null {
  return initialScreens.find((candidate) => candidate === screen) ?? null;
}

export function readAppHash(hash: string) {
  return {
    match: hash.match(/^#users\/(\d+)$/),
    detailMatch: hash.match(/^#journals\/(\d+)$/),
  };
}

export function getHistoryScreen(screen: unknown, hash: ReturnType<typeof readAppHash>): Screen {
  if (hash.detailMatch) return 'journalDetail';
  if (hash.match) return 'publicProfile';
  return historyScreens.find((candidate) => candidate === screen) ?? 'explore';
}

export function readHistoryHikingSelection(
  screen: Screen,
  state: { toPeakHikingUserId?: unknown; toPeakHikingSelection?: unknown } | null,
  userId: number,
) {
  return screen === 'hikingTracking' && state?.toPeakHikingUserId === userId
    ? readHikingSelection(state.toPeakHikingSelection)
    : null;
}
