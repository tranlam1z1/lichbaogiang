import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { formatVnd } from '../../../shared/validation.js';
import { formatDateTime } from '../account/AccountLayout.jsx';
import AdminLayout from './AdminLayout.jsx';

const num = (n) => Number(n || 0).toLocaleString('vi-VN');

/** Ô số liệu: nhãn · con số · dòng phụ. Chữ luôn dùng màu mực, không dùng màu trạng thái. */
function StatTile({ label, value, detail, to, alert }) {
  const body = (
    <>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {detail && <span className="stat-detail">{detail}</span>}
    </>
  );
  const cls = `stat-tile${alert ? ' has-alert' : ''}`;
  return to ? <Link to={to} className={`${cls} is-link`}>{body}</Link> : <div className={cls}>{body}</div>;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api.get('/admin/stats'), api.get('/admin/topups?status=PENDING&pageSize=5')])
      .then(([s, p]) => {
        setStats(s);
        setPending(p);
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <AdminLayout title="Tổng quan">
      {error && <div className="banner banner-alert" role="alert">{error}</div>}
      {!stats && !error && <div className="empty">Đang tải…</div>}
      {stats && (
        <section aria-label="Số liệu chính" className="stat-grid">
          <StatTile
            label="Tổng người dùng"
            value={num(stats.users.total)}
            detail={stats.users.locked ? `${num(stats.users.locked)} tài khoản đang bị khóa` : 'Không có tài khoản bị khóa'}
            to="/admin/nguoi-dung"
          />
          <StatTile label="Người dùng mới hôm nay" value={num(stats.users.newToday)} detail={`Tuần này: ${num(stats.users.newThisWeek)}`} />
          <StatTile
            label="Tổng lượt xuất file"
            value={num(stats.exports.total)}
            detail={`Word ${num(stats.exports.docx)} · Excel ${num(stats.exports.xlsx)} · Hôm nay ${num(stats.exports.today)}`}
            to="/admin/xuat-file"
          />
          <StatTile
            label="Xuất file trả phí"
            value={num(stats.exports.paid)}
            detail={`Miễn phí: ${num(stats.exports.free)} lượt`}
          />
          <StatTile
            label="Tổng tiền đã nạp"
            value={formatVnd(stats.topUps.totalVnd)}
            detail={`${num(stats.topUps.approvedCount)} lần nạp · ${num(stats.topUps.totalPoints)} điểm`}
            to="/admin/nap-diem?status=APPROVED"
          />
          <StatTile
            label="Yêu cầu nạp đang chờ"
            value={num(stats.topUps.pending)}
            detail={stats.topUps.pending ? '⚠ Cần duyệt' : '✓ Đã xử lý hết'}
            to="/admin/nap-diem"
            alert={stats.topUps.pending > 0}
          />
          <StatTile label="Điểm đang lưu hành" value={num(stats.pointsOutstanding)} detail="Tổng điểm trong mọi tài khoản" />
        </section>
      )}

      {pending && pending.items.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h2>Yêu cầu nạp chờ duyệt lâu nhất</h2>
            <Link className="btn btn-small" to="/admin/nap-diem">Xem tất cả ({num(pending.total)})</Link>
          </div>
          <div className="table-scroll">
            <table className="data-table history-table">
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Người dùng</th>
                  <th>Mã nạp</th>
                  <th className="num">Số tiền</th>
                </tr>
              </thead>
              <tbody>
                {pending.items.map((t) => (
                  <tr key={t.id}>
                    <td>{formatDateTime(t.createdAt)}</td>
                    <td><Link to={`/admin/nguoi-dung/${t.user.id}`}>{t.user.username}</Link></td>
                    <td className="transfer-code">{t.code}</td>
                    <td className="num">{formatVnd(t.amountVnd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </AdminLayout>
  );
}
