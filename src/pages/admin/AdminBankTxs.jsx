import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import FormDialog from '../../components/FormDialog.jsx';
import { formatVnd } from '../../../shared/validation.js';
import { Pager, TOPUP_STATUS, formatDateTime } from '../account/AccountLayout.jsx';
import AdminLayout, { DateRange, ListState, SearchBox, useApiList, useFilters, useRefreshPending } from './AdminLayout.jsx';

const DEFAULTS = { status: 'REVIEW', page: '1' };
const STATUS_TABS = [
  ['REVIEW', 'Cần kiểm tra'],
  ['AUTO_APPROVED', 'Tự động cộng điểm'],
  ['RESOLVED', 'Admin đã gán'],
  ['DISMISSED', 'Đã bỏ qua'],
  ['ALL', 'Tất cả'],
];

export const BANK_TX_STATUS = {
  AUTO_APPROVED: { label: 'Tự động cộng điểm', className: 'pill-ok' },
  RESOLVED: { label: 'Admin đã gán', className: 'pill-ok' },
  NO_CODE: { label: 'Thiếu mã nạp', className: 'pill-warn' },
  NOT_FOUND: { label: 'Mã không tồn tại', className: 'pill-warn' },
  AMOUNT_MISMATCH: { label: 'Lệch số tiền', className: 'pill-warn' },
  NOT_PENDING: { label: 'Yêu cầu đã đóng', className: 'pill-warn' },
  OTHER_ACCOUNT: { label: 'Tài khoản khác', className: '' },
  DISMISSED: { label: 'Đã bỏ qua', className: '' },
};
const NEEDS_REVIEW = ['NO_CODE', 'NOT_FOUND', 'AMOUNT_MISMATCH', 'NOT_PENDING'];

function Inner() {
  const [filters, setFilters] = useFilters(DEFAULTS);
  const state = useApiList('/admin/bank-transactions', filters);
  const refreshPending = useRefreshPending();
  const [dialog, setDialog] = useState(null); // { type: 'assign'|'dismiss', tx }
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const { data } = state;
  const close = useCallback(() => setDialog(null), []);

  const open = (type, tx) => {
    setError(null);
    setCode(tx.topUp?.code || tx.matchedCode || '');
    setNote('');
    setDialog({ type, tx });
  };

  const act = async () => {
    const { type, tx } = dialog;
    if (type === 'assign' && !code.trim()) return setError('Vui lòng nhập mã nạp.');
    if (type === 'dismiss' && !note.trim()) return setError('Vui lòng nhập ghi chú.');
    setBusy(true);
    setError(null);
    try {
      if (type === 'assign') {
        const r = await api.post(`/admin/bank-transactions/${tx.id}/assign`, { code: code.trim() });
        setNotice(`Đã gán giao dịch ${formatVnd(tx.amountVnd)} cho ${r.topUp.code}: cộng ${r.topUp.points.toLocaleString('vi-VN')} điểm cho ${r.user.username} (số dư mới ${r.user.points.toLocaleString('vi-VN')}).`);
      } else {
        await api.post(`/admin/bank-transactions/${tx.id}/dismiss`, { note });
        setNotice(`Đã bỏ qua giao dịch ${formatVnd(tx.amountVnd)}.`);
      }
      setDialog(null);
    } catch (e) {
      setError(e.errors?.code || e.message);
    } finally {
      setBusy(false);
      state.reload();
      refreshPending();
    }
    return undefined;
  };

  const tx = dialog?.tx;
  return (
    <>
      {notice && <div className="banner banner-note" role="status">{notice}</div>}
      <section className="card">
        <p className="card-text">
          Tiền chuyển vào tài khoản ngân hàng do SePay báo về. Giao dịch có đúng mã nạp và đúng số tiền được cộng điểm tự động;
          các giao dịch dưới tab <strong>Cần kiểm tra</strong> cần bạn gán cho một yêu cầu nạp hoặc bỏ qua.
        </p>
        <div className="seg" role="tablist" aria-label="Trạng thái">
          {STATUS_TABS.map(([v, label]) => (
            <button key={v} type="button" role="tab" aria-selected={filters.status === v} className={`seg-btn${filters.status === v ? ' is-active' : ''}`} onClick={() => setFilters({ status: v })}>
              {label}
            </button>
          ))}
        </div>
        <div className="filters admin-filters">
          <SearchBox value={filters.q} onChange={(q) => setFilters({ q })} placeholder="Nội dung chuyển khoản, mã KHBD…, mã tham chiếu FT…" />
          <DateRange from={filters.from} to={filters.to} onChange={setFilters} />
        </div>
        {data && <p className="result-count">{data.total.toLocaleString('vi-VN')} giao dịch</p>}
        <ListState state={state} empty={filters.status === 'REVIEW' ? 'Không có giao dịch nào cần kiểm tra. 🎉' : 'Không có giao dịch nào phù hợp.'} />
        {data?.items.length > 0 && (
          <>
            <div className="table-scroll">
              <table className="data-table history-table admin-table">
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th className="num">Số tiền</th>
                    <th>Nội dung chuyển khoản</th>
                    <th>Yêu cầu nạp</th>
                    <th>Trạng thái</th>
                    <th>{filters.status === 'REVIEW' ? 'Thao tác' : 'Người xử lý'}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((b) => (
                    <tr key={b.id}>
                      <td>
                        {b.transactionDate || formatDateTime(b.createdAt)}
                        {b.referenceCode && <div className="topup-date">{b.referenceCode}</div>}
                      </td>
                      <td className="num">{formatVnd(b.amountVnd)}</td>
                      <td className="bank-content">{b.content}</td>
                      <td>
                        {b.topUp ? (
                          <>
                            <span className="transfer-code">{b.topUp.code}</span>{' '}
                            <span className={`pill ${TOPUP_STATUS[b.topUp.status].className}`}>{TOPUP_STATUS[b.topUp.status].label}</span>
                            <div className="topup-date">
                              <Link to={`/admin/nguoi-dung/${b.topUp.user.id}`}>{b.topUp.user.username}</Link> · {formatVnd(b.topUp.amountVnd)}
                            </div>
                          </>
                        ) : (
                          b.matchedCode || '—'
                        )}
                      </td>
                      <td>
                        <span className={`pill ${BANK_TX_STATUS[b.status]?.className ?? ''}`}>{BANK_TX_STATUS[b.status]?.label ?? b.status}</span>
                        {b.note && <div className="history-note">{b.note}</div>}
                      </td>
                      <td>
                        {NEEDS_REVIEW.includes(b.status) ? (
                          <span className="head-actions">
                            <button type="button" className="btn btn-small btn-primary" onClick={() => open('assign', b)}>
                              Gán &amp; cộng điểm
                            </button>
                            <button type="button" className="btn btn-small btn-danger-outline" onClick={() => open('dismiss', b)}>
                              Bỏ qua
                            </button>
                          </span>
                        ) : (
                          b.resolvedBy && <span className="topup-date">{b.resolvedBy.username} · {formatDateTime(b.resolvedAt)}</span>
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
        open={dialog?.type === 'assign'}
        title="Gán giao dịch cho yêu cầu nạp"
        submitLabel="Gán & cộng điểm"
        busy={busy}
        error={error}
        onCancel={close}
        onSubmit={act}
      >
        {tx && (
          <>
            <p className="card-text">
              Đã nhận <strong>{formatVnd(tx.amountVnd)}</strong>, nội dung “{tx.content}”. Hệ thống sẽ duyệt yêu cầu nạp dưới đây và
              cộng <strong>số điểm của yêu cầu đó</strong> (kể cả khi yêu cầu đã bị hủy hoặc từ chối trước đó).
            </p>
            {tx.topUp && tx.topUp.amountVnd !== tx.amountVnd && (
              <div className="banner banner-alert" role="alert">
                Yêu cầu {tx.topUp.code} là {formatVnd(tx.topUp.amountVnd)} ({tx.topUp.points.toLocaleString('vi-VN')} điểm) nhưng thực nhận{' '}
                {formatVnd(tx.amountVnd)}. Nếu cần, hãy cộng/trừ phần chênh lệch ở trang người dùng sau khi gán.
              </div>
            )}
            <label className="field">
              <span>Mã nạp (KHBD…)</span>
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} placeholder="KHBDXXXXXX" />
            </label>
          </>
        )}
      </FormDialog>

      <FormDialog
        open={dialog?.type === 'dismiss'}
        title="Bỏ qua giao dịch"
        submitLabel="Bỏ qua"
        danger
        busy={busy}
        error={error}
        onCancel={close}
        onSubmit={act}
      >
        <p className="card-text">Giao dịch sẽ không cộng điểm cho ai. Ghi chú lý do để đối chiếu sau này.</p>
        <label className="field">
          <span>Ghi chú (bắt buộc)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="VD: Tiền không liên quan / đã hoàn tiền cho người chuyển" />
        </label>
      </FormDialog>
    </>
  );
}

export default function AdminBankTxs() {
  return (
    <AdminLayout title="Tiền vào tài khoản">
      <Inner />
    </AdminLayout>
  );
}
