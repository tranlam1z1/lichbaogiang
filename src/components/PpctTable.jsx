import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { useApp, getPpctIndex } from '../state/AppContext.jsx';
import { foldVietnamese } from '../lib/text.js';
import { subjectEquipment } from '../lib/schedule.js';
import EditableText from './EditableText.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import EquipmentDefaults from './EquipmentDefaults.jsx';

const PAGE = 50;

/** Các trang cần hiện (0-based): trang đầu, trang cuối, quanh trang hiện tại; null = dấu "…". */
function pageList(current, count) {
  const keep = new Set([0, count - 1, current - 1, current, current + 1]);
  const out = [];
  for (let p = 0; p < count; p += 1) {
    if (keep.has(p)) out.push(p);
    else if (out[out.length - 1] !== null) out.push(null);
  }
  return out;
}

/** Tra cứu và sửa phân phối chương trình (tên bài, đồ dùng dạy học, nội dung tích hợp từng bài). */
export default function PpctTable() {
  const { state, dispatch, grade: classGrade } = useApp();
  const [grade, setGrade] = useState(String(classGrade));
  const [subject, setSubject] = useState('');
  const [week, setWeek] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const sectionRef = useRef(null);
  // 'names' | 'equipment' | 'integration' | null
  const [confirm, setConfirm] = useState(null);
  const deferredQuery = useDeferredValue(query);

  const index = getPpctIndex(grade);
  const overrides = state.ppctOverrides[grade] || {};
  const editedCount = Object.keys(overrides).length;
  const equipment = state.ppctEquipment[grade] || {};
  const equipmentCount = Object.keys(equipment).length;
  const integration = state.ppctIntegration[grade] || {};
  const integrationCount = Object.keys(integration).length;
  const subjectDefaults = state.equipmentDefaults[grade] || {};

  const entries = useMemo(() => [...index.map.values()].sort((a, b) => a.index - b.index), [index]);
  const filtered = useMemo(() => {
    const q = foldVietnamese(deferredQuery);
    return entries.filter((e) => {
      if (subject && e.subject !== subject) return false;
      if (week && e.week !== Number(week)) return false;
      if (q) {
        const name = overrides[e.key] ?? e.name;
        if (!foldVietnamese(name).includes(q)) return false;
      }
      return true;
    });
  }, [entries, subject, week, deferredQuery, overrides]);

  const weeks = useMemo(() => [...new Set(entries.map((e) => e.week))].sort((a, b) => a - b), [entries]);
  const resetPaging = (fn) => (e) => { fn(e.target.value); setPage(0); };

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, pageCount - 1);
  const goTo = (p) => {
    setPage(p);
    const top = sectionRef.current?.getBoundingClientRect().top;
    if (top < 0) sectionRef.current.scrollIntoView({ block: 'start' });
  };

  return (
    <>
      <EquipmentDefaults grade={grade} index={index} />
      <section className="card" ref={sectionRef}>
        <div className="card-head">
          <h2>Phân phối chương trình</h2>
          {(editedCount > 0 || equipmentCount > 0 || integrationCount > 0) && (
            <span className="head-actions">
              {editedCount > 0 && (
                <>
                  <span className="pill pill-edit">{editedCount} tên bài đã sửa</span>
                  <button type="button" className="link-btn" onClick={() => setConfirm('names')}>Trả về bản gốc lớp {grade}</button>
                </>
              )}
              {equipmentCount > 0 && (
                <>
                  <span className="pill pill-edit">{equipmentCount} bài có đồ dùng riêng</span>
                  <button type="button" className="link-btn" onClick={() => setConfirm('equipment')}>Xóa đồ dùng riêng lớp {grade}</button>
                </>
              )}
              {integrationCount > 0 && (
                <>
                  <span className="pill pill-edit">{integrationCount} bài có nội dung tích hợp</span>
                  <button type="button" className="link-btn" onClick={() => setConfirm('integration')}>Xóa nội dung tích hợp lớp {grade}</button>
                </>
              )}
            </span>
          )}
        </div>
        <div className="filters">
          <label className="field">
            <span>Khối</span>
            <select value={grade} onChange={(e) => { setGrade(e.target.value); setSubject(''); setPage(0); }}>
              {[1, 2, 3, 4, 5].map((g) => <option key={g} value={g}>Lớp {g}{String(g) === String(classGrade) ? ' (lớp đang dạy)' : ''}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Môn</span>
            <select value={subject} onChange={resetPaging(setSubject)}>
              <option value="">Tất cả môn</option>
              {index.subjects.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Tuần</span>
            <select value={week} onChange={resetPaging(setWeek)}>
              <option value="">Tất cả tuần</option>
              {weeks.map((w) => <option key={w} value={w}>Tuần {w}</option>)}
            </select>
          </label>
          <label className="field field-grow">
            <span>Tìm theo tên bài</span>
            <input type="search" value={query} placeholder="Ví dụ: phân số, doan van…" onChange={resetPaging(setQuery)} />
          </label>
        </div>
        <p className="result-count">
          {filtered.length} dòng
          {pageCount > 1 && ` · đang xem ${current * PAGE + 1}–${Math.min((current + 1) * PAGE, filtered.length)} (trang ${current + 1}/${pageCount})`}
        </p>

        <div className="table-scroll">
          <table className="data-table ppct-table">
            <thead>
              <tr><th>Môn</th><th className="num">Tuần</th><th className="num">Tiết thứ</th><th className="num">PPCT</th><th>Tên bài</th><th>Đồ dùng dạy học</th><th>Nội dung tích hợp</th></tr>
            </thead>
            <tbody>
              {filtered.slice(current * PAGE, (current + 1) * PAGE).map((e) => {
                const edited = overrides[e.key] != null;
                // undefined = theo môn; '' = để trống riêng bài này.
                const ownEquipment = equipment[e.key];
                const hasOwnEquipment = ownEquipment != null;
                const bySubject = subjectEquipment(e.subject, subjectDefaults);
                return (
                  <tr key={e.key}>
                    <td className="nowrap">{e.subject}</td>
                    <td className="num">{e.week}</td>
                    <td className="num">{e.tiet}</td>
                    <td className="num">{e.num}</td>
                    <td className={`cell-title${edited ? ' is-edited' : ''}`}>
                      <EditableText
                        value={edited ? overrides[e.key] : e.name}
                        placeholder="(chưa có tên bài)"
                        ariaLabel={`Tên bài ${e.subject} tuần ${e.week} tiết ${e.tiet}`}
                        onCommit={(v) => dispatch({ type: 'SET_PPCT_NAME', grade, key: e.key, name: v, original: e.name })}
                      />
                      {edited && (
                        <button type="button" className="revert" title={`Bản gốc: ${e.name || '(trống)'}`} onClick={() => dispatch({ type: 'RESET_PPCT_NAME', grade, key: e.key })}>
                          ↺ Bản gốc
                        </button>
                      )}
                    </td>
                    <td className={`cell-equip${hasOwnEquipment ? ' is-edited' : ''}`}>
                      <EditableText
                        value={ownEquipment || ''}
                        placeholder={!hasOwnEquipment && bySubject ? `${bySubject} (theo môn)` : '(để trống)'}
                        ariaLabel={`Đồ dùng ${e.subject} tuần ${e.week} tiết ${e.tiet}`}
                        onCommit={(v) => dispatch({ type: 'SET_PPCT_EQUIPMENT', grade, key: e.key, value: v })}
                        // Môn đã để trống sẵn thì chỉ cần bỏ đồ dùng riêng của bài.
                        onClear={(hasOwnEquipment ? ownEquipment : bySubject)
                          ? () => dispatch({ type: 'SET_PPCT_EQUIPMENT', grade, key: e.key, value: '', blank: !!bySubject })
                          : undefined}
                      />
                      {hasOwnEquipment && (
                        <button
                          type="button"
                          className="revert"
                          title={`Theo môn: ${bySubject || '(trống)'}`}
                          onClick={() => dispatch({ type: 'SET_PPCT_EQUIPMENT', grade, key: e.key, value: '' })}
                        >
                          ↺ Theo môn
                        </button>
                      )}
                    </td>
                    <td className={`cell-integ${integration[e.key] ? ' is-edited' : ''}`}>
                      <EditableText
                        value={integration[e.key] || ''}
                        placeholder="(không có)"
                        ariaLabel={`Nội dung tích hợp ${e.subject} tuần ${e.week} tiết ${e.tiet}`}
                        onCommit={(v) => dispatch({ type: 'SET_PPCT_INTEGRATION', grade, key: e.key, value: v })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pageCount > 1 && (
          <nav className="pager" aria-label="Phân trang">
            <button type="button" className="btn btn-small" disabled={current === 0} onClick={() => goTo(current - 1)}>‹ Trước</button>
            {pageList(current, pageCount).map((p, i) => (p === null
              ? <span key={`gap${i}`} className="pager-gap">…</span>
              : (
                <button
                  key={p}
                  type="button"
                  className={`btn btn-small${p === current ? ' btn-primary' : ''}`}
                  aria-current={p === current ? 'page' : undefined}
                  onClick={() => goTo(p)}
                >
                  {p + 1}
                </button>
              )))}
            <button type="button" className="btn btn-small" disabled={current === pageCount - 1} onClick={() => goTo(current + 1)}>Sau ›</button>
          </nav>
        )}
        <p className="hint">
          Sửa tên bài, đồ dùng hoặc nội dung tích hợp ở đây thì mọi tuần dùng bài đó đổi theo. Bản gốc tên bài luôn được giữ để trả về.
          Ô đồ dùng chưa nhập thì dùng đồ dùng theo môn (chữ mờ); bấm ✕ để để trống riêng bài đó, ↺ Theo môn để dùng lại theo môn.
        </p>

        <ConfirmDialog
          open={confirm === 'names'}
          title={`Trả về PPCT gốc lớp ${grade}?`}
          message={`${editedCount} tên bài đã sửa sẽ trở về như trong file Excel.`}
          confirmLabel="Trả về bản gốc"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => { dispatch({ type: 'RESET_PPCT_ALL', grade }); setConfirm(null); }}
        />
        <ConfirmDialog
          open={confirm === 'equipment'}
          title={`Xóa đồ dùng riêng của các bài lớp ${grade}?`}
          message={`${equipmentCount} bài sẽ dùng lại đồ dùng theo môn.`}
          confirmLabel="Xóa đồ dùng riêng"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => { dispatch({ type: 'RESET_PPCT_EQUIPMENT_ALL', grade }); setConfirm(null); }}
        />
        <ConfirmDialog
          open={confirm === 'integration'}
          title={`Xóa nội dung tích hợp của các bài lớp ${grade}?`}
          message={`${integrationCount} bài sẽ không còn nội dung tích hợp. Nội dung đã sửa tay ở thẻ Báo giảng vẫn giữ.`}
          confirmLabel="Xóa nội dung tích hợp"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => { dispatch({ type: 'RESET_PPCT_INTEGRATION_ALL', grade }); setConfirm(null); }}
        />
      </section>
    </>
  );
}
