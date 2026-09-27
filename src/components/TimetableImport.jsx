import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { SESSIONS, schoolDays } from '../lib/schedule.js';
import { dayName } from '../lib/calendar.js';
import { normalizeSubject } from '../lib/text.js';
import { applyTimetable, parseTimetable } from '../utils/parseTimetable.js';

const BAD = new Set(['multi', 'invalid']);
const UNDO_MS = 30000;

/** Đọc sheet đầu tiên của file .xlsx thành mảng 2 chiều chữ hiển thị. */
async function readXlsx(file) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('File không có sheet nào.');
  const rows = [];
  ws.eachRow({ includeEmpty: true }, (row, r) => {
    const out = [];
    row.eachCell({ includeEmpty: true }, (cell, c) => {
      let text = '';
      try { text = cell.text ?? ''; } catch { text = ''; }
      out[c - 1] = String(text);
    });
    rows[r - 1] = Array.from(out, (v) => v ?? '');
  });
  return Array.from(rows, (r) => r || []);
}

const slotLabel = (e) => `${dayName(e.day)}, ${e.session === 'morning' ? 'sáng' : 'chiều'} tiết ${e.period}`;

/** Nút "Dán từ Excel" + hộp thoại xem trước + thông báo có nút Hoàn tác. */
export default function TimetableImport() {
  const { state, dispatch, subjectSuggestions } = useApp();
  const { timetable } = state;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [file, setFile] = useState(null); // {name, rows}
  const [fileError, setFileError] = useState(null);
  const [fixes, setFixes] = useState({}); // key → môn chọn tay ('' = bỏ qua)
  const [keepNew, setKeepNew] = useState(true);
  const [editing, setEditing] = useState(null); // key ô đang sửa
  const [manual, setManual] = useState('');
  const [undo, setUndo] = useState(null); // {prev, message}
  const fileRef = useRef(null);
  const textRef = useRef(null);

  const subjects = useMemo(() => [...subjectSuggestions, 'CHÀO CỜ'], [subjectSuggestions]);
  const known = useMemo(() => new Set(subjects.map(normalizeSubject)), [subjects]);
  const source = file ? file.rows : text;
  const result = useMemo(
    () => (source && source.length ? parseTimetable(source, { subjects, includeSaturday: !!timetable.saturday }) : null),
    [source, subjects, timetable.saturday],
  );
  const entries = result?.entries || [];

  const finalOf = (e) => {
    if (e.key in fixes) return fixes[e.key];
    if (e.status === 'ok') return e.subject;
    if (e.status === 'new') return keepNew ? e.subject : '';
    return '';
  };
  const currentOf = (e) => normalizeSubject(timetable.days?.[e.day]?.[e.session]?.[e.period - 1]);
  const byKey = new Map(entries.map((e) => [e.key, e]));
  const needCheck = entries.filter((e) => BAD.has(e.status) && !(e.key in fixes));
  const newSubjects = [...new Set(entries.filter((e) => e.status === 'new' && !(e.key in fixes)).map((e) => e.subject))];
  const readable = entries.filter((e) => finalOf(e));
  const readSubjects = new Set(readable.map(finalOf));

  const days = schoolDays(timetable);
  const counts = {};
  SESSIONS.forEach((s) => {
    const used = Math.max(0, ...entries.filter((e) => e.session === s.id).map((e) => e.period));
    counts[s.id] = Math.max(result?.periods[s.id] || 0, used);
  });

  // Tự tắt nút Hoàn tác sau một lúc.
  useEffect(() => {
    if (!undo) return undefined;
    const t = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [undo]);

  useEffect(() => {
    if (!open) return undefined;
    textRef.current?.focus();
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (editing) setEditing(null);
      else setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, editing]);

  const resetInput = () => {
    setFixes({});
    setEditing(null);
    setKeepNew(true);
    setFileError(null);
  };
  const close = () => {
    setOpen(false);
    setText('');
    setFile(null);
    resetInput();
  };

  const pickFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    resetInput();
    if (!/\.xlsx$/i.test(f.name)) {
      setFileError('Chỉ đọc được file .xlsx. Với file .xls cũ, hãy mở bằng Excel rồi bôi đen bảng và dán vào ô trên.');
      return;
    }
    try {
      const rows = await readXlsx(f);
      setText('');
      setFile({ name: f.name, rows });
    } catch (err) {
      setFileError(`Không đọc được file: ${err.message}`);
    }
  };

  const choose = (key, subject) => {
    setFixes((prev) => ({ ...prev, [key]: normalizeSubject(subject) }));
    setEditing(null);
  };
  const startEdit = (key) => {
    setEditing(key);
    const e = byKey.get(key);
    setManual(e ? finalOf(e) : '');
  };

  const apply = (mode) => {
    const cells = entries.map((e) => ({ ...e, subject: finalOf(e) }));
    const filled = cells.filter((c) => c.subject && (mode === 'replace' || !currentOf(c))).length;
    const next = applyTimetable(timetable, cells, mode, result.periods);
    dispatch({ type: 'REPLACE_TIMETABLE', timetable: next });
    setUndo({
      prev: timetable,
      message: mode === 'replace'
        ? `Đã thay thời khóa biểu mới (${filled} tiết).`
        : `Đã điền thêm ${filled} tiết vào thời khóa biểu.`,
    });
    close();
  };

  const notes = [];
  if (result?.ignored.saturday) notes.push(`Bỏ qua ${result.ignored.saturday} tiết thứ 7 (chưa bật "Học thứ 7").`);
  if (result?.ignored.sunday) notes.push(`Bỏ qua ${result.ignored.sunday} tiết chủ nhật.`);
  if (result?.ignored.outOfRange) notes.push(`Bỏ qua ${result.ignored.outOfRange} tiết vượt quá 5 tiết mỗi buổi.`);
  if (result?.ignored.duplicate) notes.push(`${result.ignored.duplicate} tiết bị ghi trùng chỗ — đã gộp lại để bạn chọn.`);

  const editEntry = editing ? byKey.get(editing) : null;

  return (
    <>
      <button type="button" className="btn btn-small" onClick={() => setOpen(true)}>Dán từ Excel</button>

      {open && (
        <div className="modal-backdrop">
          <div
            className="modal imp-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="imp-title"
          >
            <h3 id="imp-title">Nhập thời khóa biểu từ Excel</h3>
            <p className="imp-guide">Bôi đen bảng thời khóa biểu trong Excel, nhấn Ctrl+C, rồi nhấn Ctrl+V vào ô dưới đây.</p>

            <textarea
              ref={textRef}
              className="imp-paste"
              value={text}
              rows={file ? 2 : 5}
              placeholder={file ? `Đang dùng file ${file.name}. Dán vào đây để dùng dữ liệu dán thay cho file.` : 'Dán bảng vào đây…'}
              aria-label="Dữ liệu dán từ Excel"
              onChange={(e) => {
                setText(e.target.value);
                setFile(null);
                resetInput();
              }}
            />
            <div className="imp-file">
              <button type="button" className="btn btn-small" onClick={() => fileRef.current?.click()}>Tải file Excel</button>
              <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={pickFile} />
              {file && <span className="imp-file-name">{file.name} (sheet đầu tiên)</span>}
              {(text || file) && (
                <button type="button" className="link-btn" onClick={() => { setText(''); setFile(null); resetInput(); }}>Xóa</button>
              )}
            </div>
            {fileError && <div className="banner banner-alert" role="alert">{fileError}</div>}

            {result?.error && (text.trim() || file) && <div className="banner banner-alert" role="alert">{result.error}</div>}

            {result && !result.error && (
              <div className="imp-preview">
                <p className="imp-summary" role="status">
                  {result.kind === 'grid' ? 'Bảng dạng lưới. ' : 'Bảng dạng danh sách. '}
                  Đọc được <b>{readable.length}</b> tiết của <b>{readSubjects.size}</b> môn.
                  {needCheck.length > 0 && <> <span className="imp-bad-text">{needCheck.length} ô cần kiểm tra</span> (bấm vào ô đỏ để chọn).</>}
                </p>
                {notes.map((n) => <p key={n} className="imp-note">{n}</p>)}

                {newSubjects.length > 0 && (
                  <div className="imp-new">
                    <span>Môn chưa có trong danh mục / PPCT: <b>{newSubjects.join(', ')}</b></span>
                    <label className="check">
                      <input type="checkbox" checked={keepNew} onChange={(e) => setKeepNew(e.target.checked)} />
                      <span>Giữ các môn này trong thời khóa biểu</span>
                    </label>
                  </div>
                )}

                <div className="table-scroll">
                  <table className="tkb-table imp-table">
                    <thead>
                      <tr>
                        <th scope="col">Buổi</th>
                        <th scope="col">Tiết</th>
                        {days.map((d) => <th key={d} scope="col">{dayName(d)}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {SESSIONS.filter((s) => counts[s.id] > 0).map((s) => (
                        Array.from({ length: counts[s.id] }, (_, i) => i + 1).map((p) => (
                          <tr key={`${s.id}-${p}`} className={p === 1 ? 'session-start' : ''}>
                            {p === 1 && <th scope="rowgroup" rowSpan={counts[s.id]} className="cell-session">{s.label}</th>}
                            <td className="cell-num">{p}</td>
                            {days.map((d) => {
                              const e = byKey.get(`${d}-${s.id}-${p}`);
                              if (!e) return <td key={d} className="imp-empty" />;
                              const value = finalOf(e);
                              const bad = BAD.has(e.status) && !(e.key in fixes);
                              const skipped = !bad && !value;
                              const changed = !bad && !skipped && value !== currentOf(e);
                              const cls = [
                                bad && 'is-bad',
                                skipped && 'is-skipped',
                                changed && 'is-changed',
                                e.status === 'new' && !(e.key in fixes) && 'is-new',
                                editing === e.key && 'is-editing',
                              ].filter(Boolean).join(' ');
                              const shown = bad ? e.raw : value || e.subject || e.raw;
                              const tip = [
                                `Ô gốc: "${e.raw}"`,
                                changed && currentOf(e) ? `Đang có: ${currentOf(e)}` : null,
                                bad ? 'Bấm để chọn môn hoặc bỏ qua' : null,
                              ].filter(Boolean).join('\n');
                              return (
                                <td key={d} className={cls}>
                                  <button type="button" className="imp-cell" title={tip} aria-label={`${slotLabel(e)}: ${shown}`} onClick={() => startEdit(e.key)}>
                                    {shown}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        ))
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="imp-legend">
                  <span className="imp-swatch is-changed" /> Khác thời khóa biểu đang có
                  <span className="imp-swatch is-bad" /> Cần kiểm tra
                  <span className="imp-swatch is-skipped" /> Bỏ qua
                </p>

                {editEntry && (
                  <div className="imp-edit" role="group" aria-label={`Sửa ô ${slotLabel(editEntry)}`}>
                    <p>
                      <b>{slotLabel(editEntry)}</b> — ô gốc: “{editEntry.raw}”
                      {editEntry.status === 'multi' && ' · Ô có nhiều môn, hãy chọn một.'}
                      {editEntry.status === 'invalid' && ' · Không đọc được tên môn.'}
                    </p>
                    {editEntry.candidates.length > 0 && (
                      <div className="button-row">
                        {editEntry.candidates.map((c) => (
                          <button key={c} type="button" className="btn btn-small" onClick={() => choose(editEntry.key, c)}>{c}</button>
                        ))}
                      </div>
                    )}
                    <form
                      className="imp-edit-row"
                      onSubmit={(ev) => {
                        ev.preventDefault();
                        if (normalizeSubject(manual)) choose(editEntry.key, manual);
                      }}
                    >
                      <input
                        list="subject-list"
                        value={manual}
                        placeholder="Chọn hoặc gõ tên môn"
                        aria-label="Tên môn"
                        onChange={(ev) => setManual(ev.target.value)}
                      />
                      <button type="submit" className="btn btn-small btn-primary" disabled={!normalizeSubject(manual)}>Dùng môn này</button>
                      <button type="button" className="btn btn-small" onClick={() => choose(editEntry.key, '')}>Bỏ qua ô này</button>
                      <button type="button" className="btn btn-small btn-quiet" onClick={() => setEditing(null)}>Đóng</button>
                    </form>
                    {normalizeSubject(manual) && !known.has(normalizeSubject(manual)) && (
                      <p className="imp-note">“{normalizeSubject(manual)}” chưa có trong danh mục môn.</p>
                    )}
                  </div>
                )}
                {needCheck.length > 0 && <p className="imp-note">Các ô đỏ chưa chọn sẽ được bỏ qua khi áp dụng.</p>}
              </div>
            )}

            <div className="modal-actions imp-actions">
              <button type="button" className="btn" onClick={close}>Hủy</button>
              <button type="button" className="btn" disabled={!readable.length} onClick={() => apply('merge')} title="Giữ các tiết đã có, chỉ điền vào ô còn trống">
                Chỉ điền thêm
              </button>
              <button type="button" className="btn btn-primary" disabled={!readable.length} onClick={() => apply('replace')} title="Xóa thời khóa biểu cũ, dùng bảng mới">
                Thay toàn bộ
              </button>
            </div>
          </div>
        </div>
      )}

      {undo && (
        <div className="imp-toast" role="status">
          <span>{undo.message}</span>
          <button
            type="button"
            className="btn btn-small"
            onClick={() => {
              dispatch({ type: 'REPLACE_TIMETABLE', timetable: undo.prev });
              setUndo(null);
            }}
          >
            Hoàn tác
          </button>
          <button type="button" className="btn btn-small btn-quiet imp-toast-close" aria-label="Đóng thông báo" onClick={() => setUndo(null)}>×</button>
        </div>
      )}
    </>
  );
}
