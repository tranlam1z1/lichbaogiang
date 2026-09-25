import { Link } from 'react-router-dom';
import { EXPORT_STATUS, Pager, formatDateTime } from '../account/AccountLayout.jsx';
import AdminLayout, { DateRange, ListState, SearchBox, Select, useApiList, useFilters } from './AdminLayout.jsx';

const DEFAULTS = { page: '1' };

/** Lịch sử xuất file toàn hệ thống. */
export default function AdminExports() {
  const [filters, setFilters] = useFilters(DEFAULTS);
  const state = useApiList('/admin/exports', filters);
  const { data } = state;

  return (
    <AdminLayout title="Lịch sử xuất file">
      <section className="card">
        <div className="filters admin-filters">
          <SearchBox value={filters.q} onChange={(q) => setFilters({ q, userId: '' })} placeholder="Tên đăng nhập, email, SĐT" />
          <Select label="Loại file" value={filters.fileType} onChange={(fileType) => setFilters({ fileType })} options={[['', 'Tất cả'], ['DOCX', 'Word'], ['XLSX', 'Excel']]} />
          <Select label="Hình thức" value={filters.chargeType} onChange={(chargeType) => setFilters({ chargeType })} options={[['', 'Tất cả'], ['FREE', 'Lượt miễn phí'], ['POINTS', 'Trừ điểm']]} />
          <Select
            label="Trạng thái"
            value={filters.status}
            onChange={(status) => setFilters({ status })}
            options={[['', 'Tất cả'], ...Object.entries(EXPORT_STATUS).map(([k, v]) => [k, v.label])]}
          />
          <DateRange from={filters.from} to={filters.to} onChange={setFilters} />
        </div>
        {filters.userId && (
          <p className="hint">
            Đang lọc theo một người dùng. <button type="button" className="link-btn" onClick={() => setFilters({ userId: '' })}>Bỏ lọc</button>
          </p>
        )}
        {data && <p className="result-count">{data.total.toLocaleString('vi-VN')} lượt xuất</p>}
        <ListState state={state} empty="Không có lượt xuất file nào phù hợp." />
        {data?.items.length > 0 && (
          <>
            <div className="table-scroll">
              <table className="data-table history-table admin-table">
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Người dùng</th>
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
                      <td><Link to={`/admin/nguoi-dung/${e.user.id}`}>{e.user.username}</Link></td>
                      <td>{e.fileType === 'DOCX' ? 'Word' : 'Excel'}</td>
                      <td>{e.description}</td>
                      <td>{e.chargeType === 'FREE' ? '1 lượt miễn phí' : `${e.pointsCharged} điểm`}</td>
                      <td>
                        <span className={`pill ${EXPORT_STATUS[e.status].className}`}>{EXPORT_STATUS[e.status].label}</span>
                        {e.refundReason && <div className="history-note">Lỗi: {e.refundReason}</div>}
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
    </AdminLayout>
  );
}
