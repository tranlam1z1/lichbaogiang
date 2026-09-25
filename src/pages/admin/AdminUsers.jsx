import { Link, useNavigate } from 'react-router-dom';
import { Pager, formatDateTime } from '../account/AccountLayout.jsx';
import AdminLayout, { ListState, SearchBox, Select, useApiList, useFilters } from './AdminLayout.jsx';

const DEFAULTS = { role: '', status: '', sort: 'newest', page: '1' };

export default function AdminUsers() {
  const [filters, setFilters] = useFilters(DEFAULTS);
  const state = useApiList('/admin/users', filters);
  const navigate = useNavigate();
  const { data } = state;

  return (
    <AdminLayout title="Người dùng">
      <section className="card">
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
    </AdminLayout>
  );
}
