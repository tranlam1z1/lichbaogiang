import { useMemo, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { RANGE_OPTIONS, buildExportWeeks, rangeLabel, weeksInRange } from '../lib/range.js';

/** Chọn phạm vi và tải file Word / Excel. */
export default function ExportPanel({ currentWeek }) {
  const { state, grade, index, ppctOverrides } = useApp();
  const [range, setRange] = useState({ type: 'current', from: 1, to: 35 });
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);

  const weeks = useMemo(
    () => weeksInRange(state.calendar, range, currentWeek?.id),
    [state.calendar, range, currentWeek?.id],
  );

  const run = async (kind) => {
    if (!weeks.length) {
      setMessage({ tone: 'error', text: 'Phạm vi đã chọn không có tuần học nào.' });
      return;
    }
    setBusy(kind);
    setMessage(null);
    try {
      const data = buildExportWeeks({
        weeks,
        timetable: state.timetable,
        index,
        grade,
        ppctOverrides,
        lessonOverrides: state.lessonOverrides,
      });
      const { downloadDocx, downloadXlsx } = await import('../lib/download.js');
      const base = `Ke-hoach-giang-day_${(state.info.className || 'lop').replace(/\s+/g, '')}_${rangeLabel(range, weeks)}`;
      if (kind === 'docx') await downloadDocx(data, state.info, `${base}.docx`);
      else await downloadXlsx(data, state.info, `${base}.xlsx`);
      setMessage({ tone: 'ok', text: `Đã tải ${weeks.length} tuần (${kind === 'docx' ? 'Word' : 'Excel'}).` });
    } catch (e) {
      console.error(e);
      setMessage({ tone: 'error', text: `Không tạo được file: ${e.message}` });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="export-panel" aria-label="Xuất file">
      <label className="field field-inline">
        <span>Phạm vi</span>
        <select value={range.type} onChange={(e) => setRange({ ...range, type: e.target.value })}>
          {RANGE_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      </label>
      {range.type === 'custom' && (
        <span className="range-custom">
          <label className="field field-inline">
            <span>Từ tuần</span>
            <input type="number" min="1" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          </label>
          <label className="field field-inline">
            <span>đến</span>
            <input type="number" min="1" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          </label>
        </span>
      )}
      <span className="export-count">{weeks.length} tuần</span>
      <div className="export-actions">
        <button type="button" className="btn btn-primary" onClick={() => run('docx')} disabled={!!busy}>
          {busy === 'docx' ? 'Đang tạo…' : 'Tải Word'}
        </button>
        <button type="button" className="btn" onClick={() => run('xlsx')} disabled={!!busy}>
          {busy === 'xlsx' ? 'Đang tạo…' : 'Tải Excel'}
        </button>
      </div>
      {message && <p className={`export-msg is-${message.tone}`} role="status">{message.text}</p>}
    </section>
  );
}
