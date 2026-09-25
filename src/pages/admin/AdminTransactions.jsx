import { Link } from 'react-router-dom';
import { Pager, formatDateTime } from '../account/AccountLayout.jsx';
import AdminLayout, { DateRange, ListState, SearchBox, Select, TX_TYPES, signed, useApiList, useFilters } from './AdminLayout.jsx';

const DEFAULTS = { page: '1' };

/** Lịch sử giao dịch toàn hệ thống (sổ cái điểm và lượt miễn phí). */
export default function AdminTransactions() {
  const [filters, setFilters] = useFilters(DEFAULTS);
  const state = useApiList('/admin/transactions', filters);
  const { data } = state;

  return (
    <AdminLayout title="Lịch sử giao dịch">
      <section className="card">
        <div className="filters admin-filters">
          <SearchBox value={filters.q} onChange={(q) => setFilters({ q, userId: '' })} placeholder="Tên đăng nhập, email, SĐT" />
          <Select
            label="Loại giao dịch"
            value={filters.type}
            onChange={(type) => setFilters({ type })}
            options={[['', 'Tất cả'], ...Object.entries(TX_TYPES)]}
          />
          <DateRange from={filters.from} to={filters.to} onChange={setFilters} />
        </div>
        {filters.userId && (
          <p className="hint">
            Đang lọc theo một người dùng. <button type="button" className="link-btn" onClick={() => setFilters({ userId: '' })}>Bỏ lọc</button>
          </p>
        )}
        {data && (
          <p className="result-count">
            {data.total.toLocaleString('vi-VN')} giao dịch · Tổng điểm {signed(data.sum.points)} · Tổng lượt {signed(data.sum.freeExports)}
          </p>
        )}
        <ListState state={state} empty="Không có giao dịch nào phù hợp." />
        {data?.items.length > 0 && (
          <>
            <div className="table-scroll">
              <table className="data-table history-table admin-table">
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Người dùng</th>
                    <th>Loại</th>
                    <th className="num">Điểm</th>
                    <th className="num">Số dư sau</th>
                    <th className="num">Lượt miễn phí</th>
                    <th>Người thực hiện</th>
                    <th>Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((t) => (
                    <tr key={t.id}>
                      <td>{formatDateTime(t.createdAt)}</td>
                      <td><Link to={`/admin/nguoi-dung/${t.user.id}`}>{t.user.username}</Link></td>
                      <td>{TX_TYPES[t.type] || t.type}</td>
                      <td className={`num ${t.points > 0 ? 'is-plus' : t.points < 0 ? 'is-minus' : ''}`}>{t.points ? signed(t.points) : '—'}</td>
                      <td className="num">{t.balanceAfter.toLocaleString('vi-VN')}</td>
                      <td className="num">{t.freeExports ? `${signed(t.freeExports)} → ${t.freeExportsAfter}` : t.freeExportsAfter}</td>
                      <td>{t.actor ? (t.actor.id === t.user.id ? 'Chính người dùng' : t.actor.username) : 'Hệ thống'}</td>
                      <td>{t.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={data.page} totalPages={data.totalPages} onChange={(page) => setFilters({ page }, { resetPage: false })} />
          </>
        )}
      </section>
    </AdminLayout>
  );
}
