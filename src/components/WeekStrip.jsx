import { useEffect, useMemo, useRef } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { findCurrentWeek, formatDM, isTeachingWeek, weekTitle } from '../lib/calendar.js';

/** Thanh chọn tuần: tuần học bấm được, tuần nghỉ hiện riêng và không chọn được. */
export default function WeekStrip() {
  const { state, dispatch } = useApp();
  const { calendar, selectedWeekId } = state;
  const listRef = useRef(null);

  const teaching = useMemo(() => calendar.filter(isTeachingWeek), [calendar]);
  const current = useMemo(() => findCurrentWeek(calendar), [calendar]);
  const pos = teaching.findIndex((w) => w.id === selectedWeekId);

  useEffect(() => {
    const el = listRef.current?.querySelector('.week-chip.is-selected');
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [selectedWeekId]);

  const select = (w) => dispatch({ type: 'SELECT_WEEK', id: w.id });
  const step = (d) => {
    const next = teaching[pos + d];
    if (next) select(next);
  };

  let lastSemester = null;
  return (
    <section className="week-strip" aria-label="Chọn tuần">
      <div className="week-strip-bar">
        <button type="button" className="btn btn-icon" onClick={() => step(-1)} disabled={pos <= 0} aria-label="Tuần trước">‹</button>
        <div className="week-list" ref={listRef} role="listbox" aria-label="Danh sách tuần">
          {calendar.map((w) => {
            const semesterMark = w.semester !== lastSemester ? w.semester : null;
            lastSemester = w.semester;
            const teachingWeek = isTeachingWeek(w);
            const selected = w.id === selectedWeekId;
            return (
              <div key={w.id} className="week-slot">
                {semesterMark && <span className="semester-mark">HK {semesterMark}</span>}
                {teachingWeek ? (
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`week-chip${selected ? ' is-selected' : ''}${current?.id === w.id ? ' is-current' : ''}`}
                    onClick={() => select(w)}
                    title={`Tuần ${w.num}: ${formatDM(w.start)} – ${formatDM(w.end)}`}
                  >
                    <span className="week-num">{w.num}</span>
                    <span className="week-date">{formatDM(w.start)}</span>
                  </button>
                ) : (
                  <span className="week-chip is-off" title={`${weekTitle(w)}: ${formatDM(w.start)} – ${formatDM(w.end)}`}>
                    <span className="week-off-label">{w.note || 'Nghỉ'}</span>
                    <span className="week-date">{formatDM(w.start)}</span>
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <button type="button" className="btn btn-icon" onClick={() => step(1)} disabled={pos < 0 || pos >= teaching.length - 1} aria-label="Tuần sau">›</button>
      </div>
      {current && current.id !== selectedWeekId && (
        <button type="button" className="link-btn" onClick={() => select(current)}>
          Về tuần hiện tại (tuần {current.num})
        </button>
      )}
    </section>
  );
}
