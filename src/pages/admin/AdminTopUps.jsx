import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import FormDialog from '../../components/FormDialog.jsx';
import { formatVnd } from '../../../shared/validation.js';
import { Pager, TOPUP_STATUS, formatDateTime } from '../account/AccountLayout.jsx';
import AdminLayout, { DateRange, ListState, SearchBox, useApiList, useFilters, useRefreshPending } from './AdminLayout.jsx';

const DEFAULTS = { status: 'PENDING', page: '1' };
const STATUS_TABS = [
  ['PENDING', 'Chờ duyệt'],
  ['APPROVED', 'Đã duyệt'],
  ['REJECTED', 'Từ chối'],
  ['CANCELLED', 'Người dùng hủy'],
  ['', 'Tất cả'],
];

function Inner() {
  const [filters, setFilters] = useFilters(DEFAULTS);
  const state = useApiList('/admin/topups', filters);
  const refreshPending = useRefreshPending();
  const [dialog, setDialog] = useState(null); // { type: 'approve'|'reject', topUp }
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const { data } = state;
  const close = useCallback(() => setDialog(null), []);

  const act = async () => {
    const { type, topUp } = dialog;
    if (type === 'reject' && !reason.trim()) return setError('Vui lòng nhập lý do từ chối.');
    setBusy(true);
    setError(null);
    try {
      if (type === 'approve') {
        const r = await api.post(`/admin/topups/${topUp.id}/approve`);
        setNotice(`Đã duyệt ${topUp.code}: cộng ${topUp.points.toLocaleString('vi-VN')} điểm cho ${topUp.user.username} (số dư mới ${r.user.points.toLocaleString('vi-VN')}).`);
      } else {
        await api.post(`/admin/topups/${topUp.id}/reject`, { reason });
        setNotice(`Đã từ chối ${topUp.code} của ${topUp.user.username}.`);
      }
      setDialog(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      state.reload();
      refreshPending();
    }
    return undefined;
  };

  return (
    <>
      {notice && <div className="banner banner-note" role="status">{notice}</div>}
      <section className="card">
        <div className="seg" role="tablist" aria-label="Trạng thái">
          {STATUS_TABS.map(([v, label]) => (
            <button key={v || 'all'} type="button" role="tab" aria-selected={filters.status === v} className={`seg-btn${filters.status === v ? ' is-active' : ''}`} onClick={() => setFilters({ status: v })}>
              {label}
            </button>
          ))}
        </div>
        <div className="filters admin-filters">
          <SearchBox value={filters.q} onChange={(q) => setFilters({ q, userId: '' })} placeholder="Mã nạp (KHBD…), tên đăng nhập, email, SĐT" />
          <DateRange from={filters.from} to={filters.to} onChange={setFilters} />
        </div>
        {filters.userId && (
          <p className="hint">
            Đang lọc theo một người dùng. <button type="button" className="link-btn" onClick={() => setFilters({ userId: '' })}>Bỏ lọc</button>
          </p>
        )}
        {data && <p className="result-count">{data.total.toLocaleString('vi-VN')} yêu cầu</p>}
        <ListState state={state} empty={filters.status === 'PENDING' ? 'Không có yêu cầu nào đang chờ duyệt. 🎉' : 'Không có yêu cầu nào phù hợp.'} />
        {data?.items.length > 0 && (
          <>
            <div className="table-scroll">
              <table className="data-table history-table admin-table">
                <thead>
                  <tr>
                    <th>Thời gian tạo</th>
                    <th>Người dùng</th>
                    <th>Mã nạp (nội dung CK)</th>
                    <th className="num">Số tiền</th>
                    <th className="num">Điểm</th>
                    <th>Trạng thái</th>
                    <th>{filters.status === 'PENDING' ? 'Thao tác' : 'Người duyệt'}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((t) => (
                    <tr key={t.id}>
                      <td>{formatDateTime(t.createdAt)}</td>
                      <td><Link to={`/admin/nguoi-dung/${t.user.id}`}>{t.user.username}</Link></td>
                      <td className="transfer-code">{t.code}</td>
                      <td className="num">{formatVnd(t.amountVnd)}</td>
                      <td className="num">{t.points.toLocaleString('vi-VN')}</td>
                      <td>
                        <span className={`pill ${TOPUP_STATUS[t.status].className}`}>{TOPUP_STATUS[t.status].label}</span>
                        {t.rejectReason && <div className="history-note">Lý do: {t.rejectReason}</div>}
                      </td>
                      <td>
                        {t.status === 'PENDING' ? (
                          <span className="head-actions">
                            <button type="button" className="btn btn-small btn-primary" onClick={() => { setError(null); setDialog({ type: 'approve', topUp: t }); }}>
                              Duyệt
                            </button>
                            <button type="button" className="btn btn-small btn-danger-outline" onClick={() => { setError(null); setReason(''); setDialog({ type: 'reject', topUp: t }); }}>
                              Từ chối
                            </button>
                          </span>
                        ) : (
                          (t.reviewedBy || t.autoApproved) && (
                            <span className="topup-date">
                              {t.reviewedBy ? t.reviewedBy.username : 'Tự động (SePay)'} · {formatDateTime(t.reviewedAt)}
                            </span>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={data.page} totalPages={data.totalPages} onChange={(page) => setFilters({ page }, { resetPage: false })} />
          </>
        )}
      </section>

      <FormDialog
        open={dialog?.type === 'approve'}
        title="Duyệt yêu cầu nạp"
        submitLabel={`Duyệt, cộng ${dialog?.topUp.points.toLocaleString('vi-VN')} điểm`}
        busy={busy}
        error={error}
        onCancel={close}
        onSubmit={act}
      >
        {dialog && (
          <p className="card-text">
            Xác nhận tài khoản ngân hàng <strong>đã nhận {formatVnd(dialog.topUp.amountVnd)}</strong> với nội dung{' '}
            <strong className="transfer-code">{dialog.topUp.code}</strong>? Hệ thống sẽ cộng{' '}
            <strong>{dialog.topUp.points.toLocaleString('vi-VN')} điểm</strong> cho <strong>{dialog.topUp.user.username}</strong>.
          </p>
        )}
      </FormDialog>

      <FormDialog
        open={dialog?.type === 'reject'}
        title={`Từ chối ${dialog?.topUp.code || ''}`}
        submitLabel="Từ chối"
        danger
        busy={busy}
        error={error}
        onCancel={close}
        onSubmit={act}
      >
        <p className="card-text">Người dùng sẽ thấy lý do này trong lịch sử nạp điểm.</p>
        <label className="field">
          <span>Lý do từ chối (bắt buộc)</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="VD: Không nhận được chuyển khoản" />
        </label>
      </FormDialog>
    </>
  );
}

export default function AdminTopUps() {
  return (
    <AdminLayout title="Duyệt nạp điểm">
      <Inner />
    </AdminLayout>
  );
}
