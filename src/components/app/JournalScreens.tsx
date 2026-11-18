import type { ReactNode } from 'react';
import type { createActivityActions, useActivityState } from '../../hooks/useActivityFlow';
import type { Screen } from '../../services/appHistory';
import { JournalListScreen } from './JournalList';
import JournalDetailScreen from './JournalDetailScreen';
import JournalEditorScreen from './JournalEditorScreen';

type Props = {
  screen: Screen;
  header: (title: string, back?: boolean) => ReactNode;
  activity: Pick<
    ReturnType<typeof useActivityState>,
    | 'journalReadError'
    | 'journals'
    | 'journalDetail'
    | 'deletingJournalId'
    | 'editing'
    | 'availableRecords'
    | 'selectedRecord'
    | 'selectedRecordId'
    | 'journalMountain'
    | 'date'
    | 'title'
    | 'content'
    | 'isPublic'
    | 'setSelectedRecordId'
    | 'setTitle'
    | 'setContent'
    | 'setIsPublic'
  >;
  actions: Pick<
    ReturnType<typeof createActivityActions>,
    'openJournal' | 'saveJournal' | 'editJournal' | 'removeJournal'
  >;
  busy: boolean;
  currentUserId: number | null;
  onWrite: () => void;
  onSelectAuthor: (id: number) => void;
};

export default function JournalScreens({
  screen,
  header,
  activity,
  actions,
  busy,
  currentUserId,
  onWrite,
  onSelectAuthor,
}: Props) {
  const { openJournal, saveJournal, editJournal, removeJournal } = actions;
  return (
    <>
      {(screen === 'diary' || screen === 'myJournals') && (
        <>
          {header(screen === 'diary' ? '등산일지' : '내 등산일지', screen === 'myJournals')}
          <JournalListScreen
            heading={screen === 'diary' ? '등산일지' : '내 등산일지'}
            onWrite={onWrite}
            busy={busy}
            readError={activity.journalReadError}
            journals={activity.journals}
            onOpen={openJournal}
          />
        </>
      )}
      {screen === 'journalDetail' && (
        <>
          {header('등산일지', true)}
          <JournalDetailScreen
            busy={busy}
            readError={activity.journalReadError}
            journal={activity.journalDetail}
            currentUserId={currentUserId}
            deletingJournalId={activity.deletingJournalId}
            onSelectAuthor={onSelectAuthor}
            onEdit={editJournal}
            onDelete={(journal) => void removeJournal(journal)}
          />
        </>
      )}
      {screen === 'write' && (
        <>
          {header(activity.editing ? '일지 수정' : '일지 작성')}
          <JournalEditorScreen
            editing={activity.editing !== null}
            busy={busy}
            availableRecords={activity.availableRecords}
            selectedRecord={activity.selectedRecord}
            selectedRecordId={activity.selectedRecordId}
            journalMountain={activity.journalMountain}
            date={activity.date}
            title={activity.title}
            content={activity.content}
            isPublic={activity.isPublic}
            onSelectedRecordChange={activity.setSelectedRecordId}
            onTitleChange={activity.setTitle}
            onContentChange={activity.setContent}
            onPublicChange={activity.setIsPublic}
            onSubmit={() => void saveJournal()}
          />
        </>
      )}
    </>
  );
}
