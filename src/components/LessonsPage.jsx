import { useMemo } from 'react';
import { useApp } from '../state/AppContext.jsx';
import WeekStrip from './WeekStrip.jsx';
import LessonSheet from './LessonSheet.jsx';
import ExportPanel from './ExportPanel.jsx';

export default function LessonsPage() {
  const { state } = useApp();
  const week = useMemo(
    () => state.calendar.find((w) => w.id === state.selectedWeekId) || null,
    [state.calendar, state.selectedWeekId],
  );
  return (
    <>
      <WeekStrip />
      <ExportPanel currentWeek={week} />
      {week ? (
        <LessonSheet week={week} />
      ) : (
        <p className="empty">Chưa có tuần học nào. Hãy thêm tuần ở mục Lịch tuần.</p>
      )}
    </>
  );
}
