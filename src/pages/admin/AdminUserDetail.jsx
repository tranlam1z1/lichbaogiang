import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import FormDialog from '../../components/FormDialog.jsx';
import { formatVnd } from '../../../shared/validation.js';
import { EXPORT_STATUS, TOPUP_STATUS, formatDateTime } from '../account/AccountLayout.jsx';
import AdminLayout, { TX_TYPES, signed } from './AdminLayout.jsx';

const EMPTY_FORM = { reason: '', delta: '', sign: '+', value: '', password: '', role: 'USER' };

export default function AdminUserDetail() {
  const { id } = useParams();
  const { user: me, refresh: refreshMe } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null); // 'lock' | 'unlock' | 'password' | 'role' | 'points' | 'free'
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [tempPassword, setTempPassword] = useState(null);

  const load = useCallback(() => {
    api
      .get(`/admin/users/${id}`)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  const open = (name, init = {}) => {
    setForm({ ...EMPTY_FORM, ...init });
    setFormError(null);
    setDialog(name);
  };
  const close = useCallback(() => setDialog(null), []);
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  /** Gửi thao tác, báo kết quả, tải lại dữ liệu. */
  const submit = async (path, body, okText) => {
    setBusy(true);
    setFormError(null);
    try {
      const r = await api.post(`/admin/users/${id}${path}`, body);
      setDialog(null);
      setNotice(okText(r));
      if (r.temporaryPassword) setTempPassword(r.temporaryPassword);
      load();
      if (Number(id) === me.id) refreshMe().catch(() => {});
    } catch (e) {
      setFormError(Object.values(e.errors || {})[0] || e.message);
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <AdminLayout title="Chi tiết người dùng">
        <div className="banner banner-alert" role="alert">{error}</div>
        <Link to="/admin/nguoi-dung">‹ Danh sách người dùng</Link>
      </AdminLayout>
    );
  }
  if (!data) return <AdminLayout title="Chi tiết người dùng"><div className="empty">Đang tải…</div></AdminLayout>;

  const u = data.user;
  const isMe = u.id === me.id;

  return (
    <AdminLayout title={`Người dùng: ${u.username}`}>
      <p className="breadcrumb"><Link to="/admin/nguoi-dung">‹ Danh sách người dùng</Link></p>
      {notice && <div className="banner banner-note" role="status">{notice}</div>}
      {tempPassword && (
        <div className="banner banner-note temp-password" role="alert">
          Mật khẩu tạm của <strong>{u.username}</strong>: <code>{tempPassword}</code> — hãy báo cho người dùng ngay, mật khẩu này chỉ
          hiện một lần.{' '}
          <button type="button" className="link-btn" onClick={() => setTempPassword(null)}>Đã ghi lại, ẩn đi</button>
        </div>
      )}

      <section className="card">
        <div className="card-head">
          <h2>
            {u.username}{' '}
            {u.role === 'ADMIN' && <span className="pill">Quản trị</span>}{' '}
            {u.isLocked ? <span className="pill pill-warn">🔒 Đã khóa</span> : <span className="pill pill-ok">Hoạt động</span>}
          </h2>
        </div>
        {u.isLocked && <div className="banner banner-alert">Lý do khóa: {u.lockReason}</div>}
        <dl className="info-grid">
          <dt>Email</dt><dd>{u.email}</dd>
          <dt>Số điện thoại</dt><dd>{u.phone}</dd>
          <dt>Ngày đăng ký</dt><dd>{formatDateTime(u.createdAt)}</dd>
          <dt>Đăng nhập gần nhất</dt><dd>{formatDateTime(u.lastLoginAt) || 'Chưa có'}</dd>
          <dt>Lượt miễn phí còn</dt><dd><strong>{u.freeExportsLeft}</strong></dd>
          <dt>Điểm hiện có</dt><dd><strong>{u.points.toLocaleString('vi-VN')}</strong></dd>
          <dt>Đã xuất file</dt><dd>{u.exportCount} lần</dd>
          <dt>Tổng tiền đã nạp</dt><dd>{formatVnd(u.totalTopUpVnd)}</dd>
        </dl>
        <div className="button-row admin-actions">
          <button type="button" className="btn btn-primary" onClick={() => open('points')}>Cộng / trừ điểm</button>
          <button type="button" className="btn" onClick={() => open('free', { value: '' })}>Đặt lại lượt miễn phí</button>
          <button type="button" className="btn" onClick={() => open('password')}>Đặt lại mật khẩu</button>
          <button type="button" className="btn" onClick={() => open('role', { role: u.role === 'ADMIN' ? 'USER' : 'ADMIN' })} disabled={isMe}>
            {u.role === 'ADMIN' ? 'Bỏ quyền quản trị' : 'Cấp quyền quản trị'}
          </button>
          {u.isLocked ? (
            <button type="button" className="btn" onClick={() => open('unlock')}>Mở khóa</button>
          ) : (
            <button type="button" className="btn btn-danger-outline" onClick={() => open('lock')} disabled={isMe}>Khóa tài khoản</button>
          )}
        </div>
        {isMe && <p className="hint">Đây là tài khoản của bạn: không thể tự khóa hoặc tự bỏ quyền quản trị.</p>}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Giao dịch gần đây</h2>
          <Link className="btn btn-small" to={`/admin/giao-dich?userId=${u.id}`}>Xem tất cả</Link>
        </div>
        {!data.transactions.length ? <p className="card-text">Chưa có giao dịch.</p> : (
          <div className="table-scroll">
            <table className="data-table history-table">
              <thead>
                <tr><th>Thời gian</th><th>Loại</th><th className="num">Điểm</th><th className="num">Số dư</th><th className="num">Lượt</th><th>Người thực hiện</th><th>Ghi chú</th></tr>
              </thead>
              <tbody>
                {data.transactions.map((t) => (
                  <tr key={t.id}>
                    <td>{formatDateTime(t.createdAt)}</td>
                    <td>{TX_TYPES[t.type] || t.type}</td>
                    <td className="num">{t.points ? signed(t.points) : ''}</td>
                    <td className="num">{t.balanceAfter.toLocaleString('vi-VN')}</td>
                    <td className="num">{t.freeExports ? `${signed(t.freeExports)} → ${t.freeExportsAfter}` : ''}</td>
                    <td>{t.actor ? t.actor.username : 'Hệ thống'}</td>
                    <td>{t.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="two-col">
        <section className="card">
          <div className="card-head">
            <h2>Nạp điểm</h2>
            <Link className="btn btn-small" to={`/admin/nap-diem?userId=${u.id}&status=`}>Xem tất cả</Link>
          </div>
          {!data.topUps.length ? <p className="card-text">Chưa có yêu cầu nạp.</p> : (
            <ul className="mini-list">
              {data.topUps.map((t) => (
                <li key={t.id}>
                  <span className="transfer-code">{t.code}</span> {formatVnd(t.amountVnd)}{' '}
                  <span className={`pill ${TOPUP_STATUS[t.status].className}`}>{TOPUP_STATUS[t.status].label}</span>
                  <span className="topup-date"> {formatDateTime(t.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <div className="card-head">
            <h2>Xuất file</h2>
            <Link className="btn btn-small" to={`/admin/xuat-file?userId=${u.id}`}>Xem tất cả</Link>
          </div>
          {!data.exports.length ? <p className="card-text">Chưa xuất file nào.</p> : (
            <ul className="mini-list">
              {data.exports.map((e) => (
                <li key={e.id}>
                  {e.fileType === 'DOCX' ? 'Word' : 'Excel'} · {e.description} ·{' '}
                  {e.chargeType === 'FREE' ? 'miễn phí' : `${e.pointsCharged} điểm`}{' '}
                  <span className={`pill ${EXPORT_STATUS[e.status].className}`}>{EXPORT_STATUS[e.status].label}</span>
                  <span className="topup-date"> {formatDateTime(e.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ---------- Hộp thoại thao tác ---------- */}
      <FormDialog
        open={dialog === 'points'}
        title={`Cộng / trừ điểm cho ${u.username}`}
        submitLabel={form.sign === '+' ? 'Cộng điểm' : 'Trừ điểm'}
        danger={form.sign === '-'}
        busy={busy}
        error={formError}
        onCancel={close}
        onSubmit={() => {
          const n = Number(form.delta);
          if (!Number.isInteger(n) || n <= 0) return setFormError('Nhập số điểm là số nguyên dương.');
          if (!form.reason.trim()) return setFormError('Vui lòng nhập lý do.');
          return submit('/points', { delta: form.sign === '+' ? n : -n, reason: form.reason }, (r) =>
            `Đã ${form.sign === '+' ? 'cộng' : 'trừ'} ${n} điểm. Số dư mới: ${r.user.points.toLocaleString('vi-VN')} điểm.`,
          );
        }}
      >
        <p className="card-text">Hiện có {u.points.toLocaleString('vi-VN')} điểm.</p>
        <div className="seg" role="radiogroup" aria-label="Cộng hay trừ">
          {[['+', 'Cộng điểm'], ['-', 'Trừ điểm']].map(([v, label]) => (
            <button key={v} type="button" role="radio" aria-checked={form.sign === v} className={`seg-btn${form.sign === v ? ' is-active' : ''}`} onClick={() => setForm((f) => ({ ...f, sign: v }))}>
              {label}
            </button>
          ))}
        </div>
        <label className="field">
          <span>Số điểm</span>
          <input type="number" min="1" step="1" inputMode="numeric" value={form.delta} onChange={set('delta')} />
        </label>
        <label className="field">
          <span>Lý do (bắt buộc)</span>
          <input value={form.reason} onChange={set('reason')} maxLength={300} placeholder="VD: Bù điểm do lỗi hệ thống ngày 25/9" />
        </label>
      </FormDialog>

      <FormDialog
        open={dialog === 'free'}
        title={`Đặt lại lượt miễn phí cho ${u.username}`}
        submitLabel="Đặt lại"
        busy={busy}
        error={formError}
        onCancel={close}
        onSubmit={() =>
          submit('/free-exports', { value: form.value === '' ? undefined : Number(form.value), reason: form.reason }, (r) =>
            `Đã đặt lượt miễn phí thành ${r.user.freeExportsLeft}.`,
          )
        }
      >
        <p className="card-text">Hiện còn {u.freeExportsLeft} lượt. Để trống số lượt để đặt về mức mặc định cho tài khoản mới.</p>
        <label className="field">
          <span>Số lượt mới</span>
          <input type="number" min="0" max="1000" step="1" inputMode="numeric" value={form.value} onChange={set('value')} placeholder="Mặc định" />
        </label>
        <label className="field">
          <span>Ghi chú</span>
          <input value={form.reason} onChange={set('reason')} maxLength={300} />
        </label>
      </FormDialog>

      <FormDialog
        open={dialog === 'password'}
        title={`Đặt lại mật khẩu cho ${u.username}`}
        submitLabel="Đặt lại mật khẩu"
        danger
        busy={busy}
        error={formError}
        onCancel={close}
        onSubmit={() =>
          submit('/reset-password', form.password ? { password: form.password } : {}, () =>
            `Đã đặt lại mật khẩu cho ${u.username}. Mọi phiên đăng nhập cũ của tài khoản này đã bị đăng xuất.`,
          )
        }
      >
        <p className="card-text">Để trống để hệ thống tạo mật khẩu tạm ngẫu nhiên (hiện một lần sau khi đặt lại).</p>
        <label className="field">
          <span>Mật khẩu mới (tùy chọn)</span>
          <input type="text" autoComplete="new-password" value={form.password} onChange={set('password')} placeholder="Ít nhất 8 ký tự, có chữ và số" />
        </label>
      </FormDialog>

      <FormDialog
        open={dialog === 'role'}
        title={form.role === 'ADMIN' ? 'Cấp quyền quản trị' : 'Bỏ quyền quản trị'}
        submitLabel="Xác nhận"
        danger={form.role === 'ADMIN'}
        busy={busy}
        error={formError}
        onCancel={close}
        onSubmit={() => submit('/role', { role: form.role }, (r) => `Đã đổi quyền của ${u.username} thành ${r.user.role === 'ADMIN' ? 'Quản trị viên' : 'Người dùng'}.`)}
      >
        <p className="card-text">
          {form.role === 'ADMIN'
            ? `${u.username} sẽ vào được trang quản trị: xem toàn bộ người dùng, cộng/trừ điểm, duyệt nạp, sửa cài đặt.`
            : `${u.username} sẽ không vào được trang quản trị nữa.`}
        </p>
      </FormDialog>

      <FormDialog
        open={dialog === 'lock'}
        title={`Khóa tài khoản ${u.username}`}
        submitLabel="Khóa tài khoản"
        danger
        busy={busy}
        error={formError}
        onCancel={close}
        onSubmit={() => {
          if (!form.reason.trim()) return setFormError('Vui lòng nhập lý do khóa.');
          return submit('/lock', { locked: true, reason: form.reason }, () => `Đã khóa ${u.username} và đăng xuất khỏi mọi thiết bị.`);
        }}
      >
        <p className="card-text">Người dùng sẽ bị đăng xuất ngay và thấy lý do này khi cố đăng nhập.</p>
        <label className="field">
          <span>Lý do khóa (bắt buộc)</span>
          <input value={form.reason} onChange={set('reason')} maxLength={300} />
        </label>
      </FormDialog>

      <FormDialog
        open={dialog === 'unlock'}
        title={`Mở khóa ${u.username}`}
        submitLabel="Mở khóa"
        busy={busy}
        error={formError}
        onCancel={close}
        onSubmit={() => submit('/lock', { locked: false }, () => `Đã mở khóa ${u.username}.`)}
      >
        <p className="card-text">Người dùng sẽ đăng nhập lại được bằng mật khẩu hiện tại.</p>
      </FormDialog>
    </AdminLayout>
  );
}
