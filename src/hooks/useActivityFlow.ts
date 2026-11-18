import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import {
  ApiError,
  createJournal,
  deleteJournal,
  getHikingRecords,
  updateJournal,
  type HikingActivity,
  type Journal,
  type Member,
} from '../api.ts';
import type { createScreenTransition } from './useAppNavigation';
import type { Screen } from '../services/appHistory';
import type { createScopedRequest } from '../services/scopedRequest';
import {
  canCreateHikingJournal,
  JOURNAL_ELIGIBILITY_MESSAGE,
} from '../services/journalEligibility.ts';

export function useActivityState() {
  const [journals, setJournals] = useState<Journal[]>([]);
  const [journalReadError, setJournalReadError] = useState(false);
  const [journalId, setJournalId] = useState<number | null>(null);
  const [journalDetail, setJournalDetail] = useState<Journal | null>(null);
  const [deletingJournalId, setDeletingJournalId] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [date, setDate] = useState('');
  const [hikingRecords, setHikingRecords] = useState<HikingActivity[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
  const selectedRecord = hikingRecords.find((record) => record.id === selectedRecordId);
  const availableRecords = hikingRecords.filter(canCreateHikingJournal);
  const [journalMountain, setJournalMountain] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const resetDraft = () => {
    setEditing(null);
    setTitle('');
    setContent('');
    setJournalMountain('');
    setDate('');
    setSelectedRecordId(null);
    setHikingRecords([]);
    setIsPublic(false);
  };
  const resetActivity = useCallback(() => {
    setDeletingJournalId(null);
    setJournalId(null);
    setJournalDetail(null);
    setHikingRecords([]);
    setSelectedRecordId(null);
    setEditing(null);
    setTitle('');
    setContent('');
    setJournalMountain('');
    setDate('');
    setIsPublic(false);
  }, []);
  return {
    journals,
    setJournals,
    journalReadError,
    setJournalReadError,
    journalId,
    setJournalId,
    journalDetail,
    setJournalDetail,
    deletingJournalId,
    editing,
    title,
    setTitle,
    content,
    setContent,
    date,
    hikingRecords,
    setHikingRecords,
    selectedRecordId,
    setSelectedRecordId,
    selectedRecord,
    availableRecords,
    journalMountain,
    isPublic,
    setIsPublic,
    resetDraft,
    resetActivity,
    setDeletingJournalId,
    setEditing,
    setDate,
    setJournalMountain,
  };
}

type ActivityActions = {
  activity: ReturnType<typeof useActivityState>;
  screen: Screen;
  me: Member | null;
  busy: boolean;
  getAccountVersion: () => number;
  getJournalSave: () => ReturnType<typeof createScopedRequest>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string>>;
  fail: (error: unknown) => void;
  setScreen: ReturnType<typeof createScreenTransition>;
  go: (screen: Screen) => void;
  publicId: number | null;
  selected: string | null;
};

export function createActivityActions({
  activity,
  screen,
  me,
  busy,
  getAccountVersion,
  getJournalSave,
  setBusy,
  setError,
  fail,
  setScreen,
  go,
  publicId,
  selected,
}: ActivityActions) {
  const {
    editing,
    selectedRecord,
    title,
    content,
    isPublic,
    setJournals,
    setHikingRecords,
    deletingJournalId,
    setDeletingJournalId,
    setJournalDetail,
    setJournalId,
    setEditing,
    setTitle,
    setContent,
    setDate,
    setJournalMountain,
    setIsPublic,
    setSelectedRecordId,
  } = activity;
  // 이전 화면의 늦은 응답으로 현재 화면을 이동시키지 않는다. 서버 저장은 완료될 수 있으므로
  // 목록에 다시 진입할 때는 최신 데이터를 조회한다.
  const saveJournal = async () => {
    if (busy) return;
    if (!editing && selectedRecord && !canCreateHikingJournal(selectedRecord)) {
      setError(
        selectedRecord.journalId !== null
          ? '이미 등산일지를 작성한 기록입니다.'
          : JOURNAL_ELIGIBILITY_MESSAGE,
      );
      return;
    }
    if (!title.trim() || (!editing && !canCreateHikingJournal(selectedRecord))) {
      setError('등산기록을 선택하고 제목을 입력해주세요.');
      return;
    }
    const version = getAccountVersion();
    const current = getJournalSave().capture();
    await getJournalSave().run(
      async () => {
        setBusy(true);
        setError('');
        const input = { title, content, isPublic };
        return editing
          ? updateJournal(editing, input)
          : createJournal({ ...input, hikingRecordId: selectedRecord!.id });
      },
      {
        success: () => {
          setJournals([]);
          setBusy(true);
          setScreen('myJournals');
        },
        failure: (cause) => {
          fail(cause);
          if (cause instanceof ApiError && cause.status === 409) {
            getHikingRecords()
              .then((records) => {
                if (version === getAccountVersion() && current()) setHikingRecords(records);
              })
              .catch((error) => {
                if (version === getAccountVersion() && current()) fail(error);
              });
          }
        },
        settled: () => setBusy(false),
      },
    );
  };
  // 화면에서 중복 삭제와 타인 일지 삭제를 막고, 실제 소유권은 서버가 다시 검증한다.
  // 삭제한 상세 화면은 history에서 교체해 뒤로 가기로 같은 항목을 다시 열지 않게 한다.
  const removeJournal = async (journal: Journal) => {
    if (screen !== 'journalDetail' || journal.userId !== me?.userId || deletingJournalId !== null)
      return;
    if (!window.confirm('등산일지를 삭제하시겠습니까?')) return;
    const version = getAccountVersion();
    setDeletingJournalId(journal.id);
    setError('');
    try {
      await deleteJournal(journal.id);
      if (version === getAccountVersion()) {
        setJournals((current) => current.filter((item) => item.id !== journal.id));
        setJournalDetail((current) => (current?.id === journal.id ? null : current));
        if (
          window.history.state?.toPeakScreen === 'journalDetail' &&
          window.history.state?.toPeakJournalId === journal.id
        ) {
          setBusy(true);
          setScreen('myJournals', publicId, selected, null, true);
        }
      }
    } catch (cause) {
      if (version === getAccountVersion()) fail(cause);
    } finally {
      if (version === getAccountVersion()) setDeletingJournalId(null);
    }
  };
  // 목록의 ID로 상세 API를 다시 조회하므로 본문과 접근 권한은 서버의 최신 상태를 따른다.
  const openJournal = (id: number) => {
    setError('');
    setBusy(true);
    setJournalDetail(null);
    setJournalId(id);
    setScreen('journalDetail', publicId, selected, id);
  };
  // 본인 일지의 값과 ID를 작성 폼에 넘겨 신규 작성 대신 기존 일지를 수정하게 한다.
  const editJournal = (journal: Journal) => {
    if (journal.userId !== me?.userId || deletingJournalId !== null) return;
    setEditing(journal.id);
    setTitle(journal.title);
    setContent(journal.content);
    setDate(journal.hikingDate);
    setJournalMountain(journal.mountainName);
    setIsPublic(journal.isPublic);
    setScreen('write');
  };
  const writeJournalFromRecord = (record: HikingActivity) => {
    go('write');
    setSelectedRecordId(record.id);
  };
  const writeJournalFromTracking = (record: HikingActivity) => {
    if (!canCreateHikingJournal(record)) {
      setError(
        record.journalId !== null
          ? '이미 등산일지를 작성한 기록입니다.'
          : JOURNAL_ELIGIBILITY_MESSAGE,
      );
      return;
    }
    writeJournalFromRecord(record);
  };
  const updateHikingRecord = (detail: HikingActivity) =>
    setHikingRecords((current) => current.map((item) => (item.id === detail.id ? detail : item)));
  return {
    saveJournal,
    removeJournal,
    openJournal,
    editJournal,
    writeJournalFromRecord,
    writeJournalFromTracking,
    updateHikingRecord,
  };
}
