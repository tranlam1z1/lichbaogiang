import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import FormDialog from '../../components/FormDialog.jsx';
import Markdown from '../../components/Markdown.jsx';
import { formatDateTime } from '../account/AccountLayout.jsx';
import AdminLayout from './AdminLayout.jsx';

const PLACEMENTS = { MODAL: 'Modal giữa màn hình', LEFT: 'Cột trái', RIGHT: 'Cột phải' };
const TONES = { INFO: 'Thông tin', WARNING: 'Cảnh báo', SUCCESS: 'Tin vui' };
const EMPTY = { title: '', body: '', placement: 'MODAL', tone: 'INFO', isActive: true, startsAt: '', endsAt: '', sortOrder: '0' };

/** ISO → giá trị ô datetime-local (giờ máy người dùng) và ngược lại. */
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

function status(a, now = Date.now()) {
  if (!a.isActive) return { label: 'Đã tắt', className: '' };
  if (a.startsAt && Date.parse(a.startsAt) > now) return { label: 'Hẹn giờ', className: 'pill-edit' };
  if (a.endsAt && Date.parse(a.endsAt) <= now) return { label: 'Hết hạn', className: 'pill-warn' };
  return { label: 'Đang hiện', className: 'pill-ok' };
}

const toPayload = (f) => ({
  title: f.title,
  body: f.body,
  placement: f.placement,
  tone: f.tone,
  isActive: f.isActive,
  startsAt: fromLocalInput(f.startsAt),
  endsAt: fromLocalInput(f.endsAt),
  sortOrder: Number(f.sortOrder),
});

function FieldError({ error, hint }) {
  if (error) return <small className="field-error">{error}</small>;
  return hint ? <small className="field-hint">{hint}</small> : null;
}

/** Tạo / sửa / bật tắt / xóa thông báo hiện cho người dùng. */
export default function AdminAnnouncements() {
  const [items, setItems] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(null); // { id?, ...EMPTY } khi đang mở hộp thoại
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(() => {
    api
      .get('/admin/announcements')
      .then((d) => {
        setItems(d.items);
        setLoadError(null);
      })
      .catch((e) => setLoadError(e.message));
  }, []);
  useEffect(load, [load]);

  const open = (a) => {
    setErrors({});
    setError(null);
    setForm(a ? { ...a, startsAt: toLocalInput(a.startsAt), endsAt: toLocalInput(a.endsAt), sortOrder: String(a.sortOrder) } : EMPTY);
  };
  const close = useCallback(() => setForm(null), []);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    setBusy(true);
    setErrors({});
    setError(null);
    try {
      if (form.id) await api.put(`/admin/announcements/${form.id}`, toPayload(form));
      else await api.post('/admin/announcements', toPayload(form));
      setForm(null);
      load();
    } catch (e) {
      setErrors(e.errors || {});
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (a) => {
    try {
      await api.put(`/admin/announcements/${a.id}`, { ...a, isActive: !a.isActive });
      load();
    } catch (e) {
      setLoadError(e.message);
    }
  };

  const remove = async () => {
    const a = deleting;
    setDeleting(null);
    try {
      await api.delete(`/admin/announcements/${a.id}`);
      load();
    } catch (e) {
      setLoadError(e.message);
    }
  };

  return (
    <AdminLayout title="Thông báo">
      <section className="card">
        <div className="card-head">
          <h2>Thông báo cho người dùng</h2>
          <button type="button" className="btn btn-primary" onClick={() => open(null)}>Tạo thông báo</button>
        </div>
        <p className="hint">
          Modal hiện giữa màn hình mỗi lần người dùng đăng nhập. Cột trái/phải hiện hai bên trên màn hình rộng;
          màn hình nhỏ gom thành dải phía trên nội dung.
        </p>
        {loadError && <div className="banner banner-alert" role="alert">{loadError}</div>}
        {!items ? (
          !loadError && <p className="card-text">Đang tải…</p>
        ) : !items.length ? (
          <p className="card-text">Chưa có thông báo nào.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table history-table admin-table">
              <thead>
                <tr>
                  <th>Tiêu đề</th>
                  <th>Vị trí</th>
                  <th>Trạng thái</th>
                  <th>Thời gian hiển thị</th>
                  <th className="num">Thứ tự</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => {
                  const st = status(a);
                  return (
                    <tr key={a.id}>
                      <td>{a.title}</td>
                      <td>{PLACEMENTS[a.placement]}</td>
                      <td><span className={`pill ${st.className}`}>{st.label}</span></td>
                      <td>
                        {a.startsAt ? formatDateTime(a.startsAt) : 'Ngay'} → {a.endsAt ? formatDateTime(a.endsAt) : 'Không hết hạn'}
                      </td>
                      <td className="num">{a.sortOrder}</td>
                      <td>
                        <span className="head-actions">
                          <button type="button" className="btn btn-small" onClick={() => open(a)}>Sửa</button>
                          <button type="button" className="btn btn-small" onClick={() => toggle(a)}>{a.isActive ? 'Tắt' : 'Bật'}</button>
                          <button type="button" className="btn btn-small btn-danger-outline" onClick={() => setDeleting(a)}>Xóa</button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <FormDialog
        open={!!form}
        title={form?.id ? 'Sửa thông báo' : 'Tạo thông báo'}
        submitLabel={form?.id ? 'Lưu thay đổi' : 'Tạo thông báo'}
        busy={busy}
        error={error}
        onCancel={close}
        onSubmit={save}
      >
        {form && (
          <div className="ann-form">
            <label className="field">
              <span>Tiêu đề</span>
              <input value={form.title} maxLength={120} aria-invalid={errors.title ? 'true' : undefined} onChange={(e) => set({ title: e.target.value })} />
              <FieldError error={errors.title} />
            </label>
            <label className="field">
              <span>Nội dung</span>
              <textarea
                rows={6}
                value={form.body}
                maxLength={5000}
                aria-invalid={errors.body ? 'true' : undefined}
                onChange={(e) => set({ body: e.target.value })}
              />
              <FieldError error={errors.body} hint="Hỗ trợ Markdown: **đậm**, *nghiêng*, - danh sách, [chữ](https://link)." />
            </label>
            {form.body.trim() && (
              <div className="ann-preview" aria-label="Xem trước">
                <strong>Xem trước</strong>
                <div className="ann-body"><Markdown source={form.body} /></div>
              </div>
            )}
            <div className="ann-form-row">
              <label className="field">
                <span>Vị trí</span>
                <select value={form.placement} onChange={(e) => set({ placement: e.target.value })}>
                  {Object.entries(PLACEMENTS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
                <FieldError error={errors.placement} />
              </label>
              <label className="field">
                <span>Kiểu</span>
                <select value={form.tone} onChange={(e) => set({ tone: e.target.value })}>
                  {Object.entries(TONES).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
                <FieldError error={errors.tone} />
              </label>
            </div>
            <div className="ann-form-row">
              <label className="field">
                <span>Bắt đầu</span>
                <input type="datetime-local" value={form.startsAt} onChange={(e) => set({ startsAt: e.target.value })} />
                <FieldError error={errors.startsAt} hint="Trống = hiện ngay" />
              </label>
              <label className="field">
                <span>Kết thúc</span>
                <input type="datetime-local" value={form.endsAt} min={form.startsAt || undefined} onChange={(e) => set({ endsAt: e.target.value })} />
                <FieldError error={errors.endsAt} hint="Trống = không hết hạn" />
              </label>
            </div>
            <div className="ann-form-row">
              <label className="field">
                <span>Thứ tự</span>
                <input type="number" step="1" inputMode="numeric" value={form.sortOrder} onChange={(e) => set({ sortOrder: e.target.value })} />
                <FieldError error={errors.sortOrder} hint="Số nhỏ hiện trước" />
              </label>
              <label className="check">
                <input type="checkbox" checked={form.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
                Đang bật
              </label>
            </div>
          </div>
        )}
      </FormDialog>

      <ConfirmDialog
        open={!!deleting}
        title="Xóa thông báo?"
        message={`Thông báo “${deleting?.title || ''}” sẽ bị xóa vĩnh viễn. Muốn ẩn tạm thời thì dùng nút Tắt.`}
        confirmLabel="Xóa thông báo"
        danger
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
    </AdminLayout>
  );
}
