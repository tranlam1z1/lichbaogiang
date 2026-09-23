import { useMemo, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { generateCalendar, isTeachingWeek, validateCalendar, vnWeekday, dayName } from '../lib/calendar.js';
import ConfirmDialog from './ConfirmDialog.jsx';

/** Bảng lịch tuần sửa được + công cụ tạo lại cả năm. */
export default function WeekCalendar() {
  const { state, dispatch } = useApp();
  const { calendar } = state;
  const issues = useMemo(() => validateCalendar(calendar), [calendar]);
  const issueIds = new Set(issues.map((i) => i.id));
  const teachingCount = calendar.filter(isTeachingWeek).length;

  const first = calendar[0];
  const [gen, setGen] = useState({
    startDate: first?.start || '',
    teachingWeeks: teachingCount || 35,
    semester2Week: calendar.find((w) => isTeachingWeek(w) && w.semester === 'II')?.num || 19,
    tetAfterWeek: (() => {
      const i = calendar.findIndex((w) => /tết/i.test(w.note || ''));
      const prev = calendar.slice(0, Math.max(i, 0)).reverse().find(isTeachingWeek);
      return prev?.num || 0;
    })(),
    tetWeeks: calendar.filter((w) => /tết/i.test(w.note || '')).length,
    blankAfterWeek: (() => {
      const i = calendar.findIndex((w, k) => k > 0 && k < calendar.length - 1 && !isTeachingWeek(w) && !/tết/i.test(w.note || ''));
      const prev = calendar.slice(0, Math.max(i, 0)).reverse().find(isTeachingWeek);
      return prev?.num || 0;
    })(),
  });
  const [pending, setPending] = useState(null);
  const [genError, setGenError] = useState(null);

  const update = (id, patch) => dispatch({ type: 'UPDATE_WEEK', id, patch });
  const setGenField = (k) => (e) => setGen({ ...gen, [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.value });

  const preview = () => {
    try {
      setGenError(null);
      setPending(generateCalendar({ ...gen, daysPerWeek: state.timetable.saturday ? 6 : 5 }));
    } catch (e) {
      setGenError(e.message);
    }
  };

  return (
    <div className="stack">
      <section className="card">
        <h2>Tạo lại lịch tuần</h2>
        <div className="form-grid gen-grid">
          <label className="field"><span>Ngày bắt đầu tuần 1</span><input type="date" value={gen.startDate} onChange={setGenField('startDate')} /></label>
          <label className="field"><span>Số tuần học</span><input type="number" min="1" value={gen.teachingWeeks} onChange={setGenField('teachingWeeks')} /></label>
          <label className="field"><span>Học kì II bắt đầu từ tuần</span><input type="number" min="1" value={gen.semester2Week} onChange={setGenField('semester2Week')} /></label>
          <label className="field"><span>Nghỉ Tết sau tuần</span><input type="number" min="0" value={gen.tetAfterWeek} onChange={setGenField('tetAfterWeek')} /></label>
          <label className="field"><span>Số tuần nghỉ Tết</span><input type="number" min="0" value={gen.tetWeeks} onChange={setGenField('tetWeeks')} /></label>
          <label className="field"><span>Tuần không đánh số sau tuần</span><input type="number" min="0" value={gen.blankAfterWeek} onChange={setGenField('blankAfterWeek')} /></label>
        </div>
        {genError && <p className="export-msg is-error">{genError}</p>}
        <button type="button" className="btn" onClick={preview}>Tạo lại lịch tuần</button>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Lịch tuần</h2>
          <span className="pill">{teachingCount} tuần học · {calendar.length - teachingCount} tuần nghỉ / không đánh số</span>
        </div>
        {issues.length > 0 && (
          <ul className="issue-list" role="alert">
            {issues.map((i, k) => <li key={k}>{i.message}</li>)}
          </ul>
        )}
        <div className="table-scroll">
          <table className="data-table cal-table">
            <thead>
              <tr>
                <th>Số tuần</th><th>Ghi chú</th><th>Học kì</th><th>Từ ngày</th><th>Đến ngày</th><th aria-label="Thao tác" />
              </tr>
            </thead>
            <tbody>
              {calendar.map((w) => (
                <tr key={w.id} className={`${isTeachingWeek(w) ? '' : 'is-off'}${issueIds.has(w.id) ? ' has-issue' : ''}`}>
                  <td>
                    <input
                      type="number"
                      min="1"
                      className="input-num"
                      value={w.num ?? ''}
                      placeholder="—"
                      aria-label="Số tuần"
                      onChange={(e) => update(w.id, { num: e.target.value === '' ? null : Math.max(1, parseInt(e.target.value, 10) || 1) })}
                    />
                  </td>
                  <td>
                    <input value={w.note || ''} placeholder={isTeachingWeek(w) ? '' : 'Nghỉ tết, dự phòng…'} aria-label="Ghi chú" onChange={(e) => update(w.id, { note: e.target.value })} />
                  </td>
                  <td>
                    <select value={w.semester} aria-label="Học kì" onChange={(e) => update(w.id, { semester: e.target.value })}>
                      <option value="I">I</option>
                      <option value="II">II</option>
                    </select>
                  </td>
                  <td>
                    <input type="date" value={w.start} aria-label="Từ ngày" onChange={(e) => update(w.id, { start: e.target.value })} />
                    <span className="weekday-hint">{w.start ? dayName(vnWeekday(w.start)) : ''}</span>
                  </td>
                  <td>
                    <input type="date" value={w.end} aria-label="Đến ngày" onChange={(e) => update(w.id, { end: e.target.value })} />
                    <span className="weekday-hint">{w.end ? dayName(vnWeekday(w.end)) : ''}</span>
                  </td>
                  <td className="row-actions">
                    <button type="button" className="btn btn-small" title="Thêm tuần phía dưới" onClick={() => dispatch({ type: 'ADD_WEEK', afterId: w.id })}>+</button>
                    <button type="button" className="btn btn-small btn-quiet" title="Xóa dòng" onClick={() => dispatch({ type: 'REMOVE_WEEK', id: w.id })}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">Để trống ô "Số tuần" với tuần nghỉ (Tết, dự phòng…). Tuần nghỉ không hiện trong bảng báo giảng.</p>
      </section>

      <ConfirmDialog
        open={!!pending}
        title="Thay toàn bộ lịch tuần?"
        message={pending ? `Lịch mới có ${pending.length} dòng (${pending.filter(isTeachingWeek).length} tuần học), từ ${pending[0]?.start} đến ${pending[pending.length - 1]?.end}. Phần sửa tên bài theo từng tuần vẫn được giữ theo số tuần.` : ''}
        confirmLabel="Thay lịch"
        danger
        onCancel={() => setPending(null)}
        onConfirm={() => { dispatch({ type: 'REPLACE_CALENDAR', calendar: pending }); setPending(null); }}
      />
    </div>
  );
}
