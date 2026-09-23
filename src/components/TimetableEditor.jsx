import { useMemo, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { MAX_PERIODS, SESSIONS, checkTimetable, describeCheck, schoolDays } from '../lib/schedule.js';
import { dayName } from '../lib/calendar.js';
import { normalizeSubject } from '../lib/text.js';
import ConfirmDialog from './ConfirmDialog.jsx';

const NO_RULES = {};

const TrashIcon = () => (
  <svg className="icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h18" />
    <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);

const loadText = (load) => {
  if (!load) return 'Không có trong PPCT';
  return load.min === load.max ? `PPCT: ${load.mode}` : `PPCT: ${load.mode} (${load.min}–${load.max})`;
};

/** Lưới nhập thời khóa biểu + bảng đối chiếu số tiết với PPCT. */
export default function TimetableEditor() {
  const { state, dispatch, index, grade, subjectSuggestions } = useApp();
  const { timetable } = state;
  const [confirm, setConfirm] = useState(false);
  const [confirmRules, setConfirmRules] = useState(false);
  const [draft, setDraft] = useState({ subject: '', perWeek: '' });
  const [addError, setAddError] = useState(null);
  const days = schoolDays(timetable);
  const rules = state.checkRules[grade] || NO_RULES;
  const ruleCount = Object.keys(rules).length;
  const check = useMemo(() => checkTimetable(timetable, index, rules), [timetable, index, rules]);
  const hidden = Object.keys(rules).filter((s) => rules[s].hidden);
  const problems = check.filter((c) => c.status !== 'ok' && c.status !== 'skip');
  const known = new Set([...index.subjects, 'CHÀO CỜ']);

  const setOption = (patch) => dispatch({ type: 'SET_TIMETABLE_OPTION', patch });
  const setPerWeek = (subject, raw) => dispatch({
    type: 'SET_CHECK_RULE',
    grade,
    subject,
    patch: { perWeek: raw === '' ? null : Math.max(0, parseInt(raw, 10) || 0) },
  });
  // Môn chỉ do giáo viên thêm thì xóa hẳn; môn có trong PPCT / TKB thì ẩn để hiện lại được.
  const removeRow = (c) => {
    if (c.load || c.inTkb) dispatch({ type: 'SET_CHECK_RULE', grade, subject: c.subject, patch: { hidden: true } });
    else dispatch({ type: 'REMOVE_CHECK_RULE', grade, subject: c.subject });
  };
  const addRule = (e) => {
    e.preventDefault();
    const subject = normalizeSubject(draft.subject);
    const n = parseInt(draft.perWeek, 10);
    if (!subject) return setAddError('Nhập tên môn.');
    if (!Number.isInteger(n) || n < 0) return setAddError('Số tiết/tuần phải là số từ 0 trở lên.');
    dispatch({ type: 'SET_CHECK_RULE', grade, subject, patch: { perWeek: n, hidden: false } });
    setDraft({ subject: '', perWeek: '' });
    setAddError(null);
  };

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <h2>Thời khóa biểu</h2>
          <button type="button" className="link-btn" onClick={() => setConfirm(true)}>Trả về TKB của file gốc</button>
        </div>
        <div className="options-row">
          <label className="field field-inline">
            <span>Số tiết buổi sáng</span>
            <select value={timetable.morningCount} onChange={(e) => setOption({ morningCount: Number(e.target.value) })}>
              {Array.from({ length: MAX_PERIODS }, (_, i) => i + 1).map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
          <label className="field field-inline">
            <span>Số tiết buổi chiều</span>
            <select value={timetable.afternoonCount} onChange={(e) => setOption({ afternoonCount: Number(e.target.value) })}>
              {Array.from({ length: MAX_PERIODS + 1 }, (_, i) => i).map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={!!timetable.saturday} onChange={(e) => setOption({ saturday: e.target.checked })} />
            <span>Học thứ 7</span>
          </label>
        </div>

        <datalist id="subject-list">
          {subjectSuggestions.map((s) => <option key={s} value={s} />)}
        </datalist>

        <div className="table-scroll">
          <table className="tkb-table">
            <thead>
              <tr>
                <th scope="col">Buổi</th>
                <th scope="col">Tiết</th>
                {days.map((d) => <th key={d} scope="col">{dayName(d)}</th>)}
              </tr>
            </thead>
            <tbody>
              {SESSIONS.map((s) => {
                const count = timetable[s.countKey];
                return Array.from({ length: count }, (_, i) => i + 1).map((p) => (
                  <tr key={`${s.id}-${p}`} className={p === 1 ? 'session-start' : ''}>
                    {p === 1 && <th scope="rowgroup" rowSpan={count} className="cell-session">{s.label}</th>}
                    <td className="cell-num">{p}</td>
                    {days.map((d) => {
                      const v = timetable.days?.[d]?.[s.id]?.[p - 1] || '';
                      const unknown = v.trim() && !known.has(normalizeSubject(v));
                      return (
                        <td key={d} className={unknown ? 'is-unknown' : ''}>
                          <input
                            className="tkb-input"
                            list="subject-list"
                            value={v}
                            aria-label={`${dayName(d)}, ${s.label.toLowerCase()} tiết ${p}`}
                            title={unknown ? `Không có trong PPCT lớp ${grade}` : undefined}
                            onChange={(e) => dispatch({ type: 'SET_TIMETABLE_CELL', day: d, session: s.id, period: p, value: e.target.value })}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
        <p className="hint">Gõ vài chữ để chọn tên môn trong danh sách gợi ý. Tên môn phải trùng với PPCT thì mới tra được tên bài.</p>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Đối chiếu với PPCT lớp {grade}</h2>
          <span className="head-actions">
            <span className={`pill ${problems.length ? 'pill-warn' : 'pill-ok'}`}>
              {problems.length ? `${problems.length} môn chưa khớp` : 'Tất cả đều khớp'}
            </span>
            {ruleCount > 0 && (
              <button type="button" className="link-btn" onClick={() => setConfirmRules(true)}>Trả về theo PPCT</button>
            )}
          </span>
        </div>

        <form className="options-row check-add" onSubmit={addRule}>
          <label className="field field-inline">
            <span>Môn</span>
            <input list="subject-list" value={draft.subject} placeholder="Tên môn" onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
          </label>
          <label className="field field-inline">
            <span>Số tiết/tuần</span>
            <input type="number" min="0" max="20" className="input-num" value={draft.perWeek} onChange={(e) => setDraft({ ...draft, perWeek: e.target.value })} />
          </label>
          <button type="submit" className="btn btn-primary btn-small">Thêm / cập nhật</button>
          {addError && <span className="export-msg is-error">{addError}</span>}
        </form>

        <div className="table-scroll">
          <table className="data-table check-table">
            <thead>
              <tr>
                <th>Môn</th><th className="num">Trong TKB</th><th className="num">Tiết / tuần</th><th>Kết quả</th><th aria-label="Thao tác" />
              </tr>
            </thead>
            <tbody>
              {check.map((c) => (
                <tr key={c.subject} className={`status-${c.status}${c.custom ? ' is-custom' : ''}`}>
                  <td>{c.subject}</td>
                  <td className="num">{c.inTkb}</td>
                  <td className="num">
                    <input
                      type="number"
                      min="0"
                      max="20"
                      className="input-num"
                      value={c.custom ? c.expected : ''}
                      placeholder={c.load ? String(c.load.mode) : '—'}
                      aria-label={`Số tiết/tuần môn ${c.subject}`}
                      onChange={(e) => setPerWeek(c.subject, e.target.value)}
                    />
                    <span className="weekday-hint">{loadText(c.load)}</span>
                  </td>
                  <td><span className="status-text">{describeCheck(c)}</span></td>
                  <td className="row-actions">
                    {c.custom && c.load && (
                      <button type="button" className="btn btn-small btn-quiet" title={`Theo PPCT: ${c.load.mode} tiết/tuần`} onClick={() => setPerWeek(c.subject, '')}>↺</button>
                    )}
                    <button type="button" className="btn btn-small btn-quiet" title="Xóa khỏi bảng đối chiếu" aria-label={`Xóa ${c.subject} khỏi bảng đối chiếu`} onClick={() => removeRow(c)}>
                      <TrashIcon />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {hidden.length > 0 && (
          <p className="hidden-subjects">
            <span>Đã ẩn:</span>
            {hidden.map((s) => (
              <button key={s} type="button" className="btn btn-small" title="Hiện lại" onClick={() => dispatch({ type: 'SET_CHECK_RULE', grade, subject: s, patch: { hidden: false } })}>
                {s} ↺
              </button>
            ))}
          </p>
        )}
        <p className="hint">Để trống ô "Tiết / tuần" thì dùng số tiết thường gặp trong PPCT. Nhập số để tự đặt định mức (kể cả môn không có trong PPCT).</p>
      </section>

      <ConfirmDialog
        open={confirm}
        title="Trả về thời khóa biểu gốc?"
        message="Thời khóa biểu hiện tại sẽ được thay bằng thời khóa biểu trong file Excel ban đầu."
        confirmLabel="Trả về"
        danger
        onCancel={() => setConfirm(false)}
        onConfirm={() => { dispatch({ type: 'RESET_TIMETABLE' }); setConfirm(false); }}
      />
      <ConfirmDialog
        open={confirmRules}
        title={`Trả bảng đối chiếu lớp ${grade} về theo PPCT?`}
        message="Các môn tự thêm, số tiết/tuần tự đặt và các môn đã ẩn sẽ bị bỏ."
        confirmLabel="Trả về"
        danger
        onCancel={() => setConfirmRules(false)}
        onConfirm={() => { dispatch({ type: 'RESET_CHECK_RULES', grade }); setConfirmRules(false); }}
      />
    </div>
  );
}
