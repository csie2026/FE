import type { ReactNode } from 'react';
import type { Member } from '../../api';
import type { createActivityActions, useActivityState } from '../../hooks/useActivityFlow';
import type { useCourseSelection } from '../../hooks/useCourseSelection';
import type { Screen } from '../../services/appHistory';
import type { HikingSelection } from '../hiking/services/hikingNavigation';
import HikingRecordsScreen from './HikingRecordsScreen';
import HikingTrackingScreen from './HikingTrackingScreen';

type Props = {
  screen: Screen;
  header: (title: string, back?: boolean) => ReactNode;
  member: Member | null;
  busy: boolean;
  selection: HikingSelection | null;
  mountains: Pick<
    ReturnType<typeof useCourseSelection>,
    'clearHikingSelection' | 'restoreHikingSelection'
  >;
  records: ReturnType<typeof useActivityState>['hikingRecords'];
  actions: Pick<
    ReturnType<typeof createActivityActions>,
    'openJournal' | 'writeJournalFromRecord' | 'writeJournalFromTracking' | 'updateHikingRecord'
  >;
  go: (screen: Screen) => void;
};

export default function HikingScreens({
  screen,
  header,
  member,
  busy,
  selection,
  mountains,
  records,
  actions,
  go,
}: Props) {
  const { clearHikingSelection, restoreHikingSelection } = mountains;
  const { openJournal, writeJournalFromRecord, writeJournalFromTracking, updateHikingRecord } =
    actions;
  return (
    <>
      {screen === 'hikingTracking' && (
        <>
          {header('등산', selection !== null)}
          <HikingTrackingScreen
            onOpenRecords={() => go('hikingRecords')}
            userId={member!.userId}
            onRestoreSelection={restoreHikingSelection}
            selection={selection}
            onClearSelection={clearHikingSelection}
            onWriteJournal={writeJournalFromTracking}
          />
        </>
      )}
      {screen === 'hikingRecords' && (
        <>
          {header('등산기록', true)}
          <HikingRecordsScreen
            busy={busy}
            records={records}
            onRecordLoaded={updateHikingRecord}
            onOpenJournal={openJournal}
            onWriteJournal={writeJournalFromRecord}
          />
        </>
      )}
    </>
  );
}
