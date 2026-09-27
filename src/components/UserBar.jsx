import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { saveCachedPlan, usePlanSync } from '../state/AppContext.jsx';
import { clearCache, readCache } from '../state/sync.js';
import ChoiceDialog from './ChoiceDialog.jsx';

/** Góc phải header: tên người dùng, lượt miễn phí còn lại, điểm, nạp điểm, lịch sử, đăng xuất. */
export default function UserBar() {
  const { user, logout } = useAuth();
  const plan = usePlanSync();
  const [busy, setBusy] = useState(false);
  const [askUnsaved, setAskUnsaved] = useState(false);
  const [saveError, setSaveError] = useState(null);
  if (!user) return null;

  const hasUnsaved = () => (plan ? plan.isDirty() : !!readCache(user.id)?.dirty);

  // keepCache: còn thay đổi chưa lưu mà vẫn đăng xuất → giữ bản đệm để lần đăng nhập sau đồng bộ tiếp.
  const finish = (keepCache) => {
    setBusy(true);
    plan?.stop();
    // Máy dùng chung: không để lại kế hoạch của tài khoản vừa đăng xuất.
    if (!keepCache) clearCache(user.id);
    logout().catch(() => {});
  };

  const saveThenLogout = async () => {
    setBusy(true);
    setSaveError(null);
    try {
      if (plan) {
        if (!(await plan.flush())) {
          const s = plan.latest();
          throw new Error(s.status === 'conflict' ? 'Có phiên bản mới hơn trên tài khoản.' : s.error || 'Không kết nối được máy chủ.');
        }
      } else {
        await saveCachedPlan(user.id);
      }
      finish(false);
    } catch (e) {
      setSaveError(`Chưa lưu được: ${e.message}`);
      setBusy(false);
    }
  };

  return (
    <div className="userbar" aria-label="Tài khoản">
      <Link to="/lich-su" className="userbar-name" title={`${user.email} · Xem lịch sử`}>
        <span aria-hidden="true">👤</span> {user.username}
      </Link>
      <span className="pill pill-ok" title="Số lượt xuất file miễn phí còn lại">
        Miễn phí: <strong>{user.freeExportsLeft}</strong> lượt
      </span>
      <Link to="/nap-diem" className="pill pill-link" title="Số điểm hiện có — bấm để nạp thêm">
        Điểm: <strong>{user.points.toLocaleString('vi-VN')}</strong> <span aria-hidden="true">＋</span>
      </Link>
      {user.role === 'ADMIN' && (
        <Link to="/admin" className="btn btn-small btn-quiet">Quản trị</Link>
      )}
      <button
        type="button"
        className="btn btn-small btn-quiet"
        disabled={busy}
        onClick={() => {
          if (hasUnsaved()) setAskUnsaved(true);
          else finish(false);
        }}
      >
        Đăng xuất
      </button>

      <ChoiceDialog
        open={askUnsaved}
        title="Kế hoạch còn thay đổi chưa lưu"
        busy={busy}
        error={saveError}
        onCancel={() => { setAskUnsaved(false); setSaveError(null); }}
        actions={[
          { label: 'Hủy', tone: 'quiet', onClick: () => { setAskUnsaved(false); setSaveError(null); } },
          { label: 'Vẫn đăng xuất', onClick: () => finish(true) },
          { label: 'Lưu rồi đăng xuất', tone: 'primary', onClick: saveThenLogout },
        ]}
      >
        <p>Một số thay đổi chưa được lưu lên tài khoản.</p>
        <p>
          Nếu vẫn đăng xuất, bản chưa lưu được giữ tạm trên máy này và sẽ tự đồng bộ khi bạn đăng nhập lại trên máy này.
        </p>
      </ChoiceDialog>
    </div>
  );
}
