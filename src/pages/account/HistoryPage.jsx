import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { formatVnd } from '../../../shared/validation.js';
import AccountLayout, { EXPORT_STATUS, Pager, TOPUP_STATUS, formatDateTime } from './AccountLayout.jsx';

const TABS = [
  { id: 'topups', label: 'Nạp điểm' },
  { id: 'exports', label: 'Xuất file' },
];

function usePaged(path, page) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    api
      .get(`${path}?page=${page}&pageSize=20`)
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((e) => alive && setState({ data: null, error: e.message, loading: false }));
    return () => {
      alive = false;
    };
  }, [path, page]);
  return state;
}

function TopUpTable() {
  const [page, setPage] = useState(1);
  const { data, error, loading } = usePaged('/topups', page);
  if (error) return <div className="banner banner-alert" role="alert">{error}</div>;
  if (!data) return <p className="card-text">{loading ? 'Đang tải…' : ''}</p>;
  if (!data.items.length) return <p className="card-text">Bạn chưa có yêu cầu nạp điểm nào.</p>;
  return (
    <>
      <div className="table-scroll">
        <table className="data-table history-table">
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Mã nạp</th>
              <th className="num">Số tiền</th>
              <th className="num">Điểm</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((t) => (
              <tr key={t.id}>
                <td>{formatDateTime(t.createdAt)}</td>
                <td className="transfer-code">{t.code}</td>
                <td className="num">{formatVnd(t.amountVnd)}</td>
                <td className="num">{t.points.toLocaleString('vi-VN')}</td>
                <td>
                  <span className={`pill ${TOPUP_STATUS[t.status].className}`}>{TOPUP_STATUS[t.status].label}</span>
                  {t.rejectReason && <div className="history-note">Lý do: {t.rejectReason}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={data.page} totalPages={data.totalPages} onChange={setPage} />
    </>
  );
}

function ExportTable() {
  const [page, setPage] = useState(1);
  const { data, error, loading } = usePaged('/exports', page);
  if (error) return <div className="banner banner-alert" role="alert">{error}</div>;
  if (!data) return <p className="card-text">{loading ? 'Đang tải…' : ''}</p>;
  if (!data.items.length) return <p className="card-text">Bạn chưa xuất file nào.</p>;
  return (
    <>
      <div className="table-scroll">
        <table className="data-table history-table">
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Loại file</th>
              <th>Phạm vi</th>
              <th>Chi phí</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((e) => (
              <tr key={e.id}>
                <td>{formatDateTime(e.createdAt)}</td>
                <td>{e.fileType === 'DOCX' ? 'Word' : 'Excel'}</td>
                <td>{e.description}</td>
                <td>{e.chargeType === 'FREE' ? '1 lượt miễn phí' : `${e.pointsCharged} điểm`}</td>
                <td>
                  <span className={`pill ${EXPORT_STATUS[e.status].className}`}>{EXPORT_STATUS[e.status].label}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={data.page} totalPages={data.totalPages} onChange={setPage} />
    </>
  );
}

export default function HistoryPage() {
  const { refresh } = useAuth();
  const [tab, setTab] = useState('topups');
  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  return (
    <AccountLayout title="Lịch sử">
      <section className="card">
        <div className="seg" role="tablist" aria-label="Loại lịch sử">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`seg-btn${tab === t.id ? ' is-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'topups' ? <TopUpTable /> : <ExportTable />}
      </section>
    </AccountLayout>
  );
}
