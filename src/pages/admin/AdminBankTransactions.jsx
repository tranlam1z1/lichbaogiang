import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import FormDialog from '../../components/FormDialog.jsx';
import { formatVnd } from '../../../shared/validation.js';
import { Pager, TOPUP_STATUS, formatDateTime } from '../account/AccountLayout.jsx';
import AdminLayout, { DateRange, ListState, SearchBox, useApiList, useFilters, useRefreshPending } from './AdminLayout.jsx';

const DEFAULTS = { status: 'UNMATCHED', page: '1' };
const STATUS_TABS = [
  ['UNMATCHED', 'Cần xử lý'],
  ['MATCHED', 'Đã cộng điểm'],
  ['RESOLVED', 'Đã xử lý tay'],
  ['IGNORED', 'Bỏ qua'],
  ['', 'Tất cả'],
];
const BANK_STATUS = {
  UNMATCHED: { label: 'Cần xử lý', className: 'pill-warn' },
  MATCHED: { label: 'Đã cộng điểm', className: 'pill-ok' },
  RESOLVED: { label: 'Đã xử lý tay', className: '' },
  IGNORED: { label: 'Bỏ qua', className: '' },
};

function Inner() {
  const [filters, setFilters] = useFilters(DEFAULTS);
  const state = useApiList('/admin/bank-transactions', filters);
  const refreshPending = useRefreshPending();
  const [dialog, setDialog] = useState(null); // { type: 'assign'|'resolve', tx }
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const { data } = state;
  const close = useCallback(() => setDialog(null), []);

  const open = (type, tx) => {
    setError(null);
    // Gán: gợi ý sẵn mã đã tìm thấy trong nội dung (nếu có).
    setText(type === 'assign' && tx.topUp && ['PENDING', 'CANCELLED'].includes(tx.topUp.status) ? tx.topUp.code : '');
    setDialog({ type, tx });
  };

  const act = async () => {
    const { type, tx } = dialog;
    if (!text.trim()) return setError(type === 'assign' ? 'Vui lòng nhập mã nạp.' : 'Vui lòng ghi chú cách đã xử lý.');
    setBusy(true);
    setError(null);
    try {
      if (type === 'assign') {
        const r = await api.post(`/admin/bank-transactions/${tx.id}/assign`, { code: text.trim() });
        setNotice(`Đã gán ${formatVnd(tx.amountVnd)} vào ${r.topUp.code}: cộng ${r.topUp.points.toLocaleString('vi-VN')} điểm cho ${r.user.username} (số dư mới ${r.user.points.toLocaleString('vi-VN')}).`);
      } else {
        await api.post(`/admin/bank-transactions/${tx.id}/resolve`, { note: text.trim() });
        setNotice(`Đã đánh dấu giao dịch ${formatVnd(tx.amountVnd)} là đã xử lý.`);
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
        <p className="card-text">
          Mọi khoản tiền vào tài khoản nhận nạp điểm do SePay báo về. Khoản nào có đúng mã <strong>KHBD…</strong> và đúng số tiền
          đã được cộng điểm tự động. Tab <strong>Cần xử lý</strong> là các khoản hệ thống không dám tự cộng (sai nội dung, sai số tiền,
          chuyển trùng…): hãy <strong>gán vào mã nạp</strong> đúng, hoặc hoàn tiền / cộng tay rồi <strong>đánh dấu đã xử lý</strong>.
        </p>
        <div className="seg" role="tablist" aria-label="Trạng thái">
          {STATUS_TABS.map(([v, label]) => (
            <button key={v || 'all'} type="button" role="tab" aria-selected={filters.status === v} className={`seg-btn${filters.status === v ? ' is-active' : ''}`} onClick={() => setFilters({ status: v })}>
              {label}
            </button>
          ))}
        </div>
        <div className="filters admin-filters">
          <SearchBox value={filters.q} onChange={(q) => setFilters({ q })} placeholder="Nội dung chuyển khoản, mã tham chiếu" />
          <DateRange from={filters.from} to={filters.to} onChange={setFilters} />
        </div>
        {data && <p className="result-count">{data.total.toLocaleString('vi-VN')} giao dịch</p>}
        <ListState state={state} empty={filters.status === 'UNMATCHED' ? 'Không có giao dịch nào cần xử lý. 🎉' : 'Không có giao dịch nào phù hợp.'} />
        {data?.items.length > 0 && (
          <>
            <div className="table-scroll">
              <table className="data-table history-table admin-table">
                <thead>
                  <tr>
                    <th>Thời gian (ngân hàng)</th>
                    <th className="num">Số tiền</th>
                    <th>Nội dung chuyển khoản</th>
                    <th>Trạng thái</th>
                    <th>Yêu cầu nạp</th>
                    <th>{filters.status === 'UNMATCHED' ? 'Thao tác' : 'Người xử lý'}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((b) => (
                    <tr key={b.id}>
                      <td>
                        {b.transactionDate || formatDateTime(b.createdAt)}
                        {b.referenceCode && <div className="history-note">{b.referenceCode}</div>}
                      </td>
                      <td className="num">{formatVnd(b.amountVnd)}</td>
                      <td className="history-note">{b.content || '—'}</td>
                      <td>
                        <span className={`pill ${BANK_STATUS[b.status].className}`}>{BANK_STATUS[b.status].label}</span>
                        {b.note && <div className="history-note">{b.note}</div>}
                      </td>
                      <td>
                        {b.topUp ? (
                          <>
                            <span className="transfer-code">{b.topUp.code}</span> · {formatVnd(b.topUp.amountVnd)}
                            <div className="history-note">
                              <Link to={`/admin/nguoi-dung/${b.topUp.user.id}`}>{b.topUp.user.username}</Link> ·{' '}
                              {TOPUP_STATUS[b.topUp.status].label}
                            </div>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {b.status === 'UNMATCHED' ? (
                          <span className="head-actions">
                            <button type="button" className="btn btn-small btn-primary" onClick={() => open('assign', b)}>
                              Gán vào mã nạp
                            </button>
                            <button type="button" className="btn btn-small" onClick={() => open('resolve', b)}>
                              Đã xử lý
                            </button>
                          </span>
                        ) : (
                          <span className="topup-date">
                            {b.resolvedBy ? `${b.resolvedBy.username} · ${formatDateTime(b.resolvedAt)}` : b.status === 'MATCHED' ? 'Tự động' : ''}
                          </span>
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
        title="Gán giao dịch vào yêu cầu nạp"
        submitLabel="Gán và cộng điểm"
        busy={busy}
        error={error}
        onCancel={close}
        onSubmit={act}
      >
        {dialog && (
          <>
            <p className="card-text">
              Khoản <strong>{formatVnd(dialog.tx.amountVnd)}</strong> với nội dung “{dialog.tx.content || '—'}”. Yêu cầu nạp được chọn
              sẽ chuyển sang <strong>Đã cộng điểm</strong> và người dùng nhận đúng số điểm của yêu cầu đó.
            </p>
            <p className="hint">
              Nếu số tiền nhận khác số tiền của yêu cầu, hãy cộng/trừ phần chênh lệch ở trang chi tiết người dùng. Tìm mã nạp của
              người dùng ở trang <Link to="/admin/nap-diem">Duyệt nạp điểm</Link>.
            </p>
            <label className="field">
              <span>Mã nạp (KHBD…)</span>
              <input value={text} onChange={(e) => setText(e.target.value.toUpperCase())} maxLength={10} placeholder="KHBDXXXXXX" />
            </label>
          </>
        )}
      </FormDialog>

      <FormDialog
        open={dialog?.type === 'resolve'}
        title="Đánh dấu đã xử lý"
        submitLabel="Lưu"
        busy={busy}
        error={error}
        onCancel={close}
        onSubmit={act}
      >
        <p className="card-text">Dùng khi đã hoàn tiền, đã cộng điểm tay, hoặc đây là khoản không liên quan đến nạp điểm.</p>
        <label className="field">
          <span>Ghi chú (bắt buộc)</span>
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder="VD: Đã hoàn tiền cho người gửi" />
        </label>
      </FormDialog>
    </>
  );
}

export default function AdminBankTransactions() {
  return (
    <AdminLayout title="Đối soát ngân hàng">
      <Inner />
    </AdminLayout>
  );
}
