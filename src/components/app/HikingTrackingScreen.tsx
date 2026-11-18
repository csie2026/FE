import type { HikingActivity } from '../../api';
import HikingPage from '../hiking/HikingPage';
import type { HikingSelection } from '../hiking/services/hikingNavigation';

type Props = {
  userId: number;
  selection: HikingSelection | null;
  onOpenRecords: () => void;
  onRestoreSelection: (selection: HikingSelection) => void;
  onClearSelection: () => void;
  onWriteJournal: (record: HikingActivity) => void;
};

export default function HikingTrackingScreen({
  userId,
  selection,
  onOpenRecords,
  onRestoreSelection,
  onClearSelection,
  onWriteJournal,
}: Props) {
  return (
    <HikingPage
      onOpenRecords={onOpenRecords}
      key={userId}
      userId={userId}
      onRestoreSelection={onRestoreSelection}
      initialSelection={selection}
      onClearSelection={onClearSelection}
      onWriteJournal={onWriteJournal}
    />
  );
}
