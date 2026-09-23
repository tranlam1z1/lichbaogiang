import { useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { toBackup } from '../state/reducer.js';
import ConfirmDialog from './ConfirmDialog.jsx';

const FIELDS = [
  { key: 'agency', label: 'Cơ quan chủ quản', placeholder: 'UBND huyện…' },
  { key: 'school', label: 'Tên trường', placeholder: 'Trường Tiểu học…' },
  { key: 'teacher', label: 'Giáo viên chủ nhiệm', placeholder: 'Họ và tên' },
  { key: 'schoolYear', label: 'Năm học', placeholder: '2026 - 2027' },
];

/** Thông tin lớp + sao lưu / khôi phục / đặt lại. */
export default function ClassInfo() {
  const { state, dispatch } = useApp();
  const { info } = state;
  const fileRef = useRef(null);
  const [pendingRestore, setPendingRestore] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [msg, setMsg] = useState(null);

  const set = (key) => (e) => dispatch({ type: 'SET_INFO', patch: { [key]: e.target.value } });

  const backup = async () => {
    const { downloadJson } = await import('../lib/download.js');
    const d = new Date().toISOString().slice(0, 10);
    downloadJson(toBackup(state), `sao-luu-ke-hoach-giang-day_${info.className || 'lop'}_${d}.json`);
    setMsg({ tone: 'ok', text: 'Đã tải file sao lưu.' });
  };

  const pickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const body = data?.data || data;
      if (!body || (!body.calendar && !body.timetable && !body.info)) throw new Error('File không phải bản sao lưu của ứng dụng.');
      setPendingRestore({ data, name: file.name });
    } catch (err) {
      setMsg({ tone: 'error', text: `Không đọc được file: ${err.message}` });
    }
  };

  return (
    <div className="stack">
      <section className="card">
        <h2>Thông tin lớp</h2>
        <div className="form-grid">
          {FIELDS.map((f) => (
            <label key={f.key} className="field">
              <span>{f.label}</span>
              <input value={info[f.key] || ''} placeholder={f.placeholder} onChange={set(f.key)} />
            </label>
          ))}
          <label className="field">
            <span>Khối</span>
            <select value={info.grade} onChange={set('grade')}>
              {[1, 2, 3, 4, 5].map((g) => <option key={g} value={g}>Lớp {g}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Tên lớp</span>
            <input value={info.className || ''} placeholder="4A" onChange={set('className')} />
          </label>
        </div>
        <p className="hint">Khối quyết định dùng PPCT lớp nào để tra tên bài. Mọi thay đổi được lưu tự động trong trình duyệt này.</p>
      </section>

      <section className="card">
        <h2>Sao lưu dữ liệu</h2>
        <p className="card-text">
          Dữ liệu chỉ nằm trong trình duyệt của máy này. Nên tải file sao lưu định kì, hoặc để chuyển sang máy khác.
        </p>
        <div className="button-row">
          <button type="button" className="btn btn-primary" onClick={backup}>Tải file sao lưu (.json)</button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>Khôi phục từ file…</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={pickFile} />
          <button type="button" className="btn btn-danger-outline" onClick={() => setConfirmReset(true)}>Đặt lại như file gốc</button>
        </div>
        {msg && <p className={`export-msg is-${msg.tone}`} role="status">{msg.text}</p>}
      </section>

      <ConfirmDialog
        open={!!pendingRestore}
        title="Khôi phục từ file sao lưu?"
        message={`Dữ liệu hiện tại sẽ được thay bằng nội dung file "${pendingRestore?.name}".`}
        confirmLabel="Khôi phục"
        danger
        onCancel={() => setPendingRestore(null)}
        onConfirm={() => {
          dispatch({ type: 'RESTORE', data: pendingRestore.data });
          setPendingRestore(null);
          setMsg({ tone: 'ok', text: 'Đã khôi phục dữ liệu.' });
        }}
      />
      <ConfirmDialog
        open={confirmReset}
        title="Đặt lại toàn bộ như file gốc?"
        message="Thông tin lớp, thời khóa biểu, lịch tuần, mọi tên bài và đồ dùng đã sửa sẽ bị xóa. Nên tải file sao lưu trước."
        confirmLabel="Đặt lại"
        danger
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          dispatch({ type: 'RESET_ALL' });
          setConfirmReset(false);
          setMsg({ tone: 'ok', text: 'Đã đặt lại như file gốc.' });
        }}
      />
    </div>
  );
}
