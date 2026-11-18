import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react';
import {
  api,
  getJournal,
  getHikingRecords,
  type Journal,
  type Member,
  type PublicProfileDetails,
} from '../api';
import { getPublicProfileView } from '../services/publicProfile';
import type { Screen } from '../services/appHistory';
import type { useActivityState } from './useActivityFlow';

type Setter<T> = Dispatch<SetStateAction<T>>;

type ScreenData = {
  screen: Screen;
  publicId: number | null;
  profileRefresh: number;
  me: Member | null;
  accountVersion: RefObject<number>;
  memberImageVersion: RefObject<number>;
  setMe: Setter<Member | null>;
  setPublicProfile: Setter<PublicProfileDetails | null>;
  setBusy: Setter<boolean>;
  fail: (error: unknown) => void;
  activity: Pick<
    ReturnType<typeof useActivityState>,
    | 'journalId'
    | 'editing'
    | 'setJournalDetail'
    | 'setJournals'
    | 'setHikingRecords'
    | 'setJournalReadError'
  >;
};

export function useScreenData({
  screen,
  publicId,
  profileRefresh,
  me,
  accountVersion,
  memberImageVersion,
  setMe,
  setPublicProfile,
  setBusy,
  fail,
  activity,
}: ScreenData) {
  const {
    journalId,
    editing,
    setJournalDetail,
    setJournals,
    setHikingRecords,
    setJournalReadError,
  } = activity;
  // 화면별로 본인 일지·공개 일지·타인 프로필을 조회하고, 화면 이탈이나 계정 변경 뒤의 응답은 버린다.
  useEffect(() => {
    if (!me?.profileCompleted) return;
    const version = accountVersion.current;
    // 마이페이지 조회 중 이미지가 갱신되면 늦게 도착한 회원 응답이 최신 이미지 URL을 덮어쓰지 않게 한다.
    const imageVersion = memberImageVersion.current;
    const controller = new AbortController();
    let active = true;
    const update =
      <T>(setter: (value: T) => void) =>
      (value: T) => {
        if (active && version === accountVersion.current) setter(value);
      };
    const request =
      screen === 'journalDetail' && journalId
        ? getJournal(journalId, controller.signal).then(update(setJournalDetail))
        : screen === 'diary'
          ? api<Journal[]>('/api/journals', 'GET', undefined, controller.signal).then(
              update(setJournals),
            )
          : screen === 'myJournals'
            ? api<Journal[]>('/api/users/me/journals', 'GET', undefined, controller.signal).then(
                update(setJournals),
              )
            : screen === 'publicProfile' && publicId
              ? getPublicProfileView(publicId, controller.signal).then(
                  ({ profile, journals: records }) => {
                    if (active && version === accountVersion.current) {
                      setPublicProfile(profile);
                      setJournals(records);
                    }
                  },
                )
              : screen === 'profile'
                ? Promise.all([
                    api<Member>('/api/users/me', 'GET', undefined, controller.signal),
                    api<Journal[]>('/api/users/me/journals', 'GET', undefined, controller.signal),
                  ]).then(([user, records]) => {
                    if (active && version === accountVersion.current) {
                      setMe((current) =>
                        current?.userId === user.userId &&
                        imageVersion !== memberImageVersion.current
                          ? {
                              ...user,
                              profileImageUrl: current.profileImageUrl,
                              backgroundImageUrl: current.backgroundImageUrl,
                            }
                          : user,
                      );
                      setJournals(records);
                    }
                  })
                : (screen === 'write' && !editing) || screen === 'hikingRecords'
                  ? getHikingRecords(controller.signal).then(update(setHikingRecords))
                  : Promise.resolve();
    request
      .then(() => {
        if (active && version === accountVersion.current) setJournalReadError(false);
      })
      .catch((e) => {
        if (active && version === accountVersion.current) {
          setJournalReadError(true);
          fail(e);
        }
      })
      .finally(() => {
        if (active && version === accountVersion.current) setBusy(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    screen,
    publicId,
    journalId,
    editing,
    me?.userId,
    me?.profileCompleted,
    profileRefresh,
    fail,
    accountVersion,
    memberImageVersion,
    setMe,
    setPublicProfile,
    setBusy,
    setJournalDetail,
    setJournals,
    setHikingRecords,
    setJournalReadError,
  ]);
}
