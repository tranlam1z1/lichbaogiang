import { useMemo, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { buildWeekLessons, flattenWeek, schoolDays } from '../lib/schedule.js';
import { formatDM, formatDMY } from '../lib/calendar.js';
import EditableText from './EditableText.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';

/** Bảng kế hoạch giảng dạy của một tuần. */
export default function LessonSheet({ week }) {
  const { state, dispatch, grade, index, ppctOverrides } = useApp();
  const [confirmReset, setConfirmReset] = useState(false);
  const weekOverrides = state.lessonOverrides[week.num] || {};

  const built = useMemo(
    () => buildWeekLessons({ week, timetable: state.timetable, index, grade, ppctOverrides, lessonOverrides: weekOverrides }),
    [week, state.timetable, index, grade, ppctOverrides, weekOverrides],
  );
  const rows = useMemo(() => flattenWeek(built), [built]);
  const editedCount = rows.filter((r) => r.editedTitle || r.editedEquipment).length;
  const warnCount = rows.filter((r) => r.warning).length;

  const setField = (row, field, value) =>
    dispatch({
      type: 'SET_LESSON',
      weekNum: week.num,
      slotKey: row.key,
      subject: row.subject,
      field,
      value,
      base: field === 'title' ? row.baseTitle : '',
    });

  return (
    <section className="sheet" aria-label={`Kế hoạch giảng dạy tuần ${week.num}`}>
      <header className="sheet-head">
        <div className="sheet-title">
          <span className="sheet-week">Tuần {week.num}</span>
          <span className="sheet-dates">
            {formatDMY(week.start)} – {formatDMY(week.end)} · Học kì {week.semester} · Lớp {state.info.className}
          </span>
        </div>
        <div className="sheet-meta">
          {warnCount > 0 && <span className="pill pill-warn">{warnCount} tiết chưa tra được</span>}
          {editedCount > 0 && (
            <>
              <span className="pill pill-edit">{editedCount} ô đã sửa</span>
              <button type="button" className="link-btn" onClick={() => setConfirmReset(true)}>Bỏ mọi chỗ sửa của tuần</button>
            </>
          )}
        </div>
      </header>

      {built.irregular && (
        <p className="banner banner-note">
          Tuần này không trọn {schoolDays(state.timetable).length} ngày ({formatDM(week.start)} – {formatDM(week.end)}).
          Ngày được ghi lần lượt từ ngày bắt đầu; các buổi vượt quá ngày kết thúc để trống ngày.
        </p>
      )}

      <div className="table-scroll">
        <table className="lesson-table">
          <colgroup>
            <col className="c-day" /><col className="c-session" /><col className="c-period" /><col className="c-subject" />
            <col className="c-ppct" /><col className="c-title" /><col className="c-equip" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Thứ / ngày</th>
              <th scope="col">Buổi</th>
              <th scope="col">Tiết</th>
              <th scope="col">Môn</th>
              <th scope="col">PPCT</th>
              <th scope="col">Tên bài dạy</th>
              <th scope="col">Đồ dùng dạy học</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={`${r.dayRowSpan ? 'day-start' : ''}${r.subject ? '' : ' is-empty'}`}>
                {r.dayRowSpan > 0 && (
                  <th scope="rowgroup" rowSpan={r.dayRowSpan} className="cell-day">
                    <span className="day-name">{r.dayLabel}</span>
                    <span className="day-date">{r.date ? formatDM(r.date) : '—'}</span>
                  </th>
                )}
                {r.sessionRowSpan > 0 && (
                  <td rowSpan={r.sessionRowSpan} className="cell-session">{r.sessionLabel}</td>
                )}
                <td className="cell-num">{r.period}</td>
                <td className="cell-subject">{r.subject}</td>
                <td className="cell-num cell-ppct">{r.ppct}</td>
                <td className={`cell-title${r.editedTitle ? ' is-edited' : ''}`}>
                  {r.subject ? (
                    <>
                      <EditableText
                        value={r.title}
                        onCommit={(v) => setField(r, 'title', v)}
                        placeholder={r.warning ? '' : 'Nhập tên bài'}
                        ariaLabel={`Tên bài ${r.subject}, ${r.dayLabel} tiết ${r.period}`}
                      />
                      {r.warning && !r.editedTitle && <span className="cell-warn">{r.warning}</span>}
                      {r.editedTitle && (
                        <button
                          type="button"
                          className="revert"
                          title={r.baseTitle ? `Theo PPCT: ${r.baseTitle}` : 'Xóa phần đã sửa'}
                          onClick={() => setField(r, 'title', r.baseTitle)}
                        >
                          ↺ Theo PPCT
                        </button>
                      )}
                    </>
                  ) : null}
                </td>
                <td className={`cell-equip${r.editedEquipment ? ' is-edited' : ''}`}>
                  {r.subject ? (
                    <EditableText
                      value={r.equipment}
                      onCommit={(v) => setField(r, 'equipment', v)}
                      ariaLabel={`Đồ dùng ${r.subject}, ${r.dayLabel} tiết ${r.period}`}
                    />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">Bấm vào ô Tên bài hoặc Đồ dùng để sửa. Phần sửa chỉ áp dụng cho tuần {week.num}; ô đã sửa có vạch đỏ bên trái.</p>

      <ConfirmDialog
        open={confirmReset}
        title={`Bỏ mọi chỗ sửa của tuần ${week.num}?`}
        message="Tên bài trở về theo PPCT và cột đồ dùng dạy học được xóa trắng."
        confirmLabel="Bỏ chỗ sửa"
        danger
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          dispatch({ type: 'RESET_WEEK_LESSONS', weekNum: week.num });
          setConfirmReset(false);
        }}
      />
    </section>
  );
}
