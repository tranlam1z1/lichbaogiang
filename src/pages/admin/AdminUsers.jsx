import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import FormDialog from '../../components/FormDialog.jsx';
import { Pager, formatDateTime } from '../account/AccountLayout.jsx';
import AdminLayout, { ListState, SearchBox, Select, useApiList, useFilters } from './AdminLayout.jsx';

const DEFAULTS = { role: '', status: '', sort: 'newest', page: '1' };
const EMPTY_BULK = { delta: '', reason: '', includeLocked: false };

/** Hộp thoại cộng điểm cho tất cả người dùng. Hiện trước số tài khoản sẽ được cộng. */
function BulkPointsDialog({ open, onCancel, onDone }) {
  const [form, setForm] = useState(EMPTY_BULK);
  const [counts, setCounts] = useState(null); // { total, locked }
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY_BULK);
    setError(null);
    setCounts(null);
    api.get('/admin/stats').then((s) => setCounts({ total: s.users.total, locked: s.users.locked })).catch(() => {});
  }, [open]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const n = Number(form.delta);
  const target = counts && (form.includeLocked ? counts.total : counts.total - counts.locked);

  const submit = async () => {
    if (!Number.isInteger(n) || n <= 0) return setError('Nhập số điểm là số nguyên dương.');
    if (!form.reason.trim()) return setError('Vui lòng nhập lý do.');
    setBusy(true);
    setError(null);
    try {
      const r = await api.post('/admin/users/bulk-points', { delta: n, reason: form.reason, includeLocked: form.includeLocked });
      onDone(`Đã cộng ${r.delta.toLocaleString('vi-VN')} điểm cho ${r.count.toLocaleString('vi-VN')} tài khoản.`);
    } catch (e) {
      setError(Object.values(e.errors || {})[0] || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormDialog
      open={open}
      title="Cộng điểm toàn server"
      submitLabel={target != null && n > 0 ? `Cộng cho ${target.toLocaleString('vi-VN')} tài khoản` : 'Cộng điểm'}
      busy={busy}
      error={error}
      onCancel={onCancel}
      onSubmit={submit}
    >
      <p className="card-text">
        Mỗi tài khoản được cộng cùng một số điểm, có ghi lịch sử giao dịch riêng. Thao tác này không hoàn tác tự động được.
      </p>
      <label className="field">
        <span>Số điểm cộng cho mỗi tài khoản</span>
        <input type="number" min="1" step="1" inputMode="numeric" value={form.delta} onChange={set('delta')} />
      </label>
      <label className="field">
        <span>Lý do (bắt buộc)</span>
        <input value={form.reason} onChange={set('reason')} maxLength={300} placeholder="VD: Tặng điểm khai giảng năm học mới" />
      </label>
      <label className="check">
        <input type="checkbox" checked={form.includeLocked} onChange={(e) => setForm((f) => ({ ...f, includeLocked: e.target.checked }))} />
        <span>Cộng cả cho tài khoản đang bị khóa{counts ? ` (${counts.locked.toLocaleString('vi-VN')} tài khoản)` : ''}</span>
      </label>
      {target != null && n > 0 && (
        <p className="card-text">
          Sẽ cộng <strong>{n.toLocaleString('vi-VN')}</strong> điểm cho <strong>{target.toLocaleString('vi-VN')}</strong> tài khoản
          (tổng {(n * target).toLocaleString('vi-VN')} điểm).
        </p>
      )}
    </FormDialog>
  );
}

export default function AdminUsers() {
  const [filters, setFilters] = useFilters(DEFAULTS);
  const state = useApiList('/admin/users', filters);
  const navigate = useNavigate();
  const { refresh: refreshMe } = useAuth();
  const { data, reload } = state;
  const [bulkOpen, setBulkOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const closeBulk = useCallback(() => setBulkOpen(false), []);

  return (
    <AdminLayout title="Người dùng">
      {notice && <div className="banner banner-note" role="status">{notice}</div>}
      <section className="card">
        <div className="card-head">
          <h2>Danh sách người dùng</h2>
          <button type="button" className="btn btn-small btn-primary" onClick={() => setBulkOpen(true)}>
            ＋ Cộng điểm toàn server
          </button>
        </div>
        <div className="filters admin-filters">
          <SearchBox value={filters.q} onChange={(q) => setFilters({ q })} placeholder="Tên đăng nhập, email hoặc số điện thoại" />
          <Select
            label="Quyền"
            value={filters.role}
            onChange={(role) => setFilters({ role })}
            options={[['', 'Tất cả'], ['USER', 'Người dùng'], ['ADMIN', 'Quản trị viên']]}
          />
          <Select
            label="Trạng thái"
            value={filters.status}
            onChange={(status) => setFilters({ status })}
            options={[['', 'Tất cả'], ['active', 'Đang hoạt động'], ['locked', 'Đã khóa']]}
          />
          <Select
            label="Sắp xếp"
            value={filters.sort}
            onChange={(sort) => setFilters({ sort })}
            options={[['newest', 'Mới đăng ký'], ['oldest', 'Cũ nhất'], ['points', 'Nhiều điểm nhất'], ['username', 'Tên A→Z']]}
          />
        </div>
        {data && <p className="result-count">{data.total.toLocaleString('vi-VN')} người dùng</p>}
        <ListState state={state} empty="Không có người dùng nào phù hợp." />
        {data?.items.length > 0 && (
          <>
            <div className="table-scroll">
              <table className="data-table history-table admin-table">
                <thead>
                  <tr>
                    <th>Tên đăng nhập</th>
                    <th>Email</th>
                    <th>Số điện thoại</th>
                    <th>Quyền</th>
                    <th>Trạng thái</th>
                    <th className="num">Lượt miễn phí</th>
                    <th className="num">Điểm</th>
                    <th className="num">Đã xuất</th>
                    <th>Ngày đăng ký</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((u) => (
                    <tr key={u.id} className="is-clickable" onClick={() => navigate(`/admin/nguoi-dung/${u.id}`)}>
                      <td>
                        <Link to={`/admin/nguoi-dung/${u.id}`} onClick={(e) => e.stopPropagation()}>{u.username}</Link>
                      </td>
                      <td>{u.email}</td>
                      <td>{u.phone}</td>
                      <td>{u.role === 'ADMIN' ? <span className="pill">Quản trị</span> : 'Người dùng'}</td>
                      <td>
                        {u.isLocked ? <span className="pill pill-warn" title={u.lockReason || ''}>🔒 Đã khóa</span> : 'Hoạt động'}
                      </td>
                      <td className="num">{u.freeExportsLeft}</td>
                      <td className="num">{u.points.toLocaleString('vi-VN')}</td>
                      <td className="num">{u.exportCount}</td>
                      <td>{formatDateTime(u.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={data.page} totalPages={data.totalPages} onChange={(page) => setFilters({ page }, { resetPage: false })} />
          </>
        )}
      </section>
      <BulkPointsDialog
        open={bulkOpen}
        onCancel={closeBulk}
        onDone={(text) => {
          setBulkOpen(false);
          setNotice(text);
          reload();
          refreshMe().catch(() => {});
        }}
      />
    </AdminLayout>
  );
}
