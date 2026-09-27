import { useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { toBackup } from '../state/reducer.js';
import { SIGNATURE_ROLES, prepareSignature } from '../lib/signature.js';
import ConfirmDialog from './ConfirmDialog.jsx';

const FIELDS = [
  { key: 'agency', label: 'Cơ quan chủ quản', placeholder: 'UBND huyện…' },
  { key: 'school', label: 'Tên trường', placeholder: 'Trường Tiểu học…' },
  { key: 'teacher', label: 'Giáo viên chủ nhiệm', placeholder: 'Họ và tên' },
  { key: 'leader', label: 'Tổ trưởng chuyên môn', placeholder: 'Họ và tên' },
  { key: 'schoolYear', label: 'Năm học', placeholder: '2026 - 2027' },
];

/** Một phần chữ ký (giáo viên hoặc tổ trưởng): bật/tắt chèn ảnh, tải / đổi / xóa ảnh. */
function SignatureEditor({ label, value, onChange }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const sig = value || { enabled: false, image: '' };

  const pickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange({ ...sig, image: await prepareSignature(file) });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sig-item">
      <h3>{label}</h3>
      <label className="check">
        <input type="checkbox" checked={!!sig.enabled} onChange={(e) => onChange({ ...sig, enabled: e.target.checked })} />
        <span>Chèn chữ ký vào file xuất</span>
      </label>
      {sig.image && (
        <div className="sig-preview">
          <img src={sig.image} alt={`Chữ ký ${label.toLowerCase()}`} />
        </div>
      )}
      <div className="button-row">
        {sig.image ? (
          <>
            <button type="button" className="btn btn-small" disabled={busy} onClick={() => fileRef.current?.click()}>Đổi ảnh</button>
            <button type="button" className="btn btn-small btn-danger-outline" disabled={busy} onClick={() => onChange({ ...sig, image: '' })}>Xóa</button>
          </>
        ) : (
          <button type="button" className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? 'Đang xử lý ảnh…' : 'Tải ảnh chữ ký…'}
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" hidden onChange={pickFile} />
      </div>
      {sig.enabled && !sig.image && <p className="hint">Chưa có ảnh, file xuất sẽ để trống chỗ ký.</p>}
      {error && <p className="export-msg is-error" role="alert">{error}</p>}
    </div>
  );
}

/** Thông tin lớp + sao lưu / khôi phục / đặt lại. */
export default function ClassInfo() {
  const { state, dispatch } = useApp();
  const { info } = state;
  const fileRef = useRef(null);
  const [pendingRestore, setPendingRestore] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [msg, setMsg] = useState(null);

  const set = (key) => (e) => dispatch({ type: 'SET_INFO', patch: { [key]: e.target.value } });
  const signatures = info.signatures || {};
  const setSignature = (role) => (value) =>
    dispatch({ type: 'SET_INFO', patch: { signatures: { ...signatures, [role]: value } } });

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
        <p className="hint">Khối quyết định dùng PPCT lớp nào để tra tên bài. Mọi thay đổi được lưu tự động vào tài khoản của bạn.</p>
      </section>

      <section className="card">
        <h2>Chữ ký</h2>
        <p className="card-text">
          Cuối mỗi tuần trong file Word/Excel có chỗ ký của giáo viên và tổ trưởng chuyên môn. Có thể chèn sẵn ảnh chữ ký
          (PNG hoặc JPG, tối đa 300 KB; nên chụp chữ ký trên nền giấy trắng), nếu không thì để trống để ký tay sau khi in.
        </p>
        <div className="sig-grid">
          {SIGNATURE_ROLES.map((r) => (
            <SignatureEditor key={r.key} label={r.label} value={signatures[r.key]} onChange={setSignature(r.key)} />
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Sao lưu dữ liệu</h2>
        <p className="card-text">
          Kế hoạch được lưu vào tài khoản, đăng nhập ở máy khác vẫn thấy. Có thể tải thêm file sao lưu để cất giữ riêng.
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
