import { useEffect, useState } from 'react';
import { downloadPlanJson, useApp } from '../state/AppContext.jsx';
import { formatSavedAt } from '../state/sync.js';
import ChoiceDialog from './ChoiceDialog.jsx';

/** Nội dung chỉ báo theo trạng thái lưu: tone (màu), icon, chữ đầy đủ, chữ ngắn cho điện thoại. */
function describe(sync) {
  switch (sync.status) {
    case 'pending':
    case 'saving':
      return { tone: 'saving', icon: '⟳', text: 'Đang lưu…', short: 'Đang lưu' };
    case 'offline':
      return sync.cacheError
        ? { tone: 'error', icon: '!', text: 'Mất mạng và không lưu tạm được trên máy này — đừng đóng trang', short: 'Chưa lưu' }
        : { tone: 'offline', icon: '⚠', text: 'Mất mạng — đã lưu tạm trên máy này, sẽ tự đồng bộ khi có mạng', short: 'Mất mạng' };
    case 'error':
      return { tone: 'error', icon: '!', text: 'Chưa lưu được', short: 'Chưa lưu', action: 'Thử lại' };
    case 'conflict':
      return { tone: 'error', icon: '!', text: 'Có phiên bản mới hơn', short: 'Bản mới hơn', action: 'Xem' };
    default: {
      const at = formatSavedAt(sync.savedAt);
      return { tone: 'saved', icon: '✓', text: at ? `Đã lưu lúc ${at}` : 'Đã lưu', short: 'Đã lưu' };
    }
  }
}

/** Chỉ báo "đã lưu / đang lưu / mất mạng / lỗi / xung đột" trên đầu trang + hộp thoại xung đột. */
export default function SaveStatus() {
  const { state, sync } = useApp();
  const [showConflict, setShowConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const d = describe(sync);

  // Có xung đột thì mở hộp thoại ngay; người dùng có thể để sau rồi bấm "Xem".
  useEffect(() => {
    if (sync.status === 'conflict') setShowConflict(true);
    else setShowConflict(false);
  }, [sync.status]);

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const onAction = () => {
    if (sync.status === 'conflict') setShowConflict(true);
    else sync.retry();
  };
  const title = sync.status === 'error' ? `Nguyên nhân: ${sync.error}` : d.text;
  const when = formatSavedAt(sync.conflict?.updatedAt);

  return (
    <>
      <div className={`save-status is-${d.tone}`} title={title}>
        <span className="save-icon" aria-hidden="true">{d.icon}</span>
        <span aria-live="polite">
          <span className="save-long">{d.text}</span>
          <span className="save-short">{d.short}</span>
          {sync.status === 'error' && <span className="visually-hidden">. Nguyên nhân: {sync.error}</span>}
        </span>
        {d.action && (
          <>
            <span aria-hidden="true">·</span>
            <button type="button" className="link-btn save-action" onClick={onAction}>{d.action}</button>
          </>
        )}
      </div>

      <ChoiceDialog
        open={showConflict && sync.status === 'conflict'}
        title="Có phiên bản mới hơn trên tài khoản"
        busy={busy}
        error={error}
        onCancel={() => setShowConflict(false)}
        actions={[
          { label: 'Để sau', tone: 'quiet', onClick: () => setShowConflict(false) },
          { label: 'Dùng bản trên tài khoản', onClick: () => run(sync.acceptServer) },
          { label: 'Giữ bản đang mở', tone: 'primary', onClick: () => run(sync.keepLocal) },
        ]}
      >
        <p>Kế hoạch đã được sửa ở máy/trình duyệt khác{when ? ` lúc ${when}` : ''}.</p>
        <ul className="choice-list">
          <li><b>Dùng bản trên tài khoản:</b> bỏ các thay đổi trên trang này, tải bản mới nhất về.</li>
          <li><b>Giữ bản đang mở:</b> ghi đè bản trên tài khoản bằng bản trên trang này.</li>
        </ul>
        <p>
          <button type="button" className="link-btn" onClick={() => downloadPlanJson(state, 'dang-mo')}>Tải bản đang mở về (.json)</button>
          {' '}trước khi chọn để không mất gì.
        </p>
      </ChoiceDialog>
    </>
  );
}
