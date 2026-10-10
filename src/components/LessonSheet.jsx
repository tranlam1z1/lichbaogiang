import { useMemo, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { buildWeekLessons, flattenWeek, isEquipmentBlank, schoolDays } from '../lib/schedule.js';
import { formatDM, formatDMY } from '../lib/calendar.js';
import EditableText from './EditableText.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';

const NOT_TAUGHT_TIP = 'Môn này bạn không dạy. Bật lại ở mục "Môn tôi dạy" trong thẻ Thời khóa biểu.';

/** Bảng kế hoạch giảng dạy của một tuần. */
export default function LessonSheet({ week }) {
  const { state, dispatch, grade, index, ppctOverrides, equipmentDefaults, ppctEquipment, ppctIntegration } = useApp();
  const [confirmReset, setConfirmReset] = useState(false);
  const weekOverrides = state.lessonOverrides[week.num] || {};
  // Công tắc để trống cột đồ dùng: cả năm (đặt ở thẻ Phân phối chương trình) hoặc riêng tuần này.
  const blankAllWeeks = !!state.equipmentBlank?.grades.includes(Number(grade));
  const blankEquipment = isEquipmentBlank(state.equipmentBlank, grade, week.num);

  const built = useMemo(
    () => buildWeekLessons({
      week, timetable: state.timetable, index, grade, ppctOverrides, equipmentDefaults, ppctEquipment, ppctIntegration, lessonOverrides: weekOverrides, notTaught: state.notTaught,
      blankEquipment,
    }),
    [week, state.timetable, index, grade, ppctOverrides, equipmentDefaults, ppctEquipment, ppctIntegration, weekOverrides, state.notTaught, blankEquipment],
  );
  const rows = useMemo(() => flattenWeek(built), [built]);
  const editedCount = rows.filter((r) => r.editedTitle || r.editedEquipment || r.editedIntegration).length;
  const warnCount = rows.filter((r) => r.warning).length;

  const setField = (row, field, value) =>
    dispatch({
      type: 'SET_LESSON',
      weekNum: week.num,
      slotKey: row.key,
      subject: row.subject,
      field,
      value,
      base: { title: row.baseTitle, equipment: row.baseEquipment, integration: row.baseIntegration }[field],
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
          {blankAllWeeks ? (
            <span className="pill" title="Bỏ dấu ở bảng Đồ dùng dạy học theo môn, thẻ Phân phối chương trình, để hiện lại.">
              Đồ dùng đang để trống mọi tuần
            </span>
          ) : (
            <label className="check check-small">
              <input
                type="checkbox"
                checked={blankEquipment}
                onChange={(e) => dispatch({ type: 'SET_EQUIPMENT_BLANK', scope: 'week', id: week.num, on: e.target.checked })}
              />
              <span>Để trống cột Đồ dùng tuần này</span>
            </label>
          )}
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
            <col className="c-ppct" /><col className="c-title" /><col className="c-equip" /><col className="c-integ" />
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
              <th scope="col">Nội dung tích hợp</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={`${r.dayRowSpan ? 'day-start' : ''}${r.subject ? '' : ' is-empty'}${r.notTaught ? ' is-not-taught' : ''}`}>
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
                <td className="cell-subject" title={r.notTaught ? NOT_TAUGHT_TIP : undefined}>{r.subject}</td>
                <td className="cell-num cell-ppct">{r.ppct}</td>
                <td className={`cell-title${r.editedTitle ? ' is-edited' : ''}`}>
                  {r.notTaught ? (
                    <span className="cell-not-taught" title={NOT_TAUGHT_TIP} aria-label={NOT_TAUGHT_TIP} />
                  ) : r.subject ? (
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
                  {r.subject && !r.notTaught && !blankEquipment ? (
                    <EditableText
                      value={r.equipment}
                      onCommit={(v) => setField(r, 'equipment', v)}
                      onClear={r.equipment ? () => setField(r, 'equipment', '') : undefined}
                      ariaLabel={`Đồ dùng ${r.subject}, ${r.dayLabel} tiết ${r.period}`}
                    />
                  ) : null}
                </td>
                <td className={`cell-integ${r.editedIntegration ? ' is-edited' : ''}`}>
                  {r.subject && !r.notTaught ? (
                    <EditableText
                      value={r.integration}
                      onCommit={(v) => setField(r, 'integration', v)}
                      ariaLabel={`Nội dung tích hợp ${r.subject}, ${r.dayLabel} tiết ${r.period}`}
                    />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        Bấm vào ô Tên bài, Đồ dùng hoặc Nội dung tích hợp để sửa (xóa hết chữ là để trống). Phần sửa chỉ áp dụng cho tuần {week.num}; ô đã sửa có vạch đỏ bên trái.
        Đồ dùng và nội dung tích hợp dùng chung cho mọi tuần đặt ở thẻ Phân phối chương trình.
        Bấm ✕ để để trống một ô đồ dùng; đánh dấu "Để trống cột Đồ dùng tuần này" để để trống cả cột (nội dung vẫn được giữ, bỏ dấu là hiện lại).
      </p>

      <ConfirmDialog
        open={confirmReset}
        title={`Bỏ mọi chỗ sửa của tuần ${week.num}?`}
        message="Tên bài trở về theo PPCT, đồ dùng dạy học và nội dung tích hợp trở về như đã đặt ở thẻ Phân phối chương trình."
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
