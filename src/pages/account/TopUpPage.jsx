import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { formatVnd, pointsForAmount, validateTopUpAmount } from '../../../shared/validation.js';
import AccountLayout, { TOPUP_STATUS, formatDateTime } from './AccountLayout.jsx';

const QUICK_MULTIPLES = [1, 2, 5, 10, 20];

function CopyButton({ text }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(text));
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      window.prompt('Sao chép nội dung dưới đây:', String(text));
    }
  };
  return (
    <button type="button" className="btn btn-small" onClick={copy}>
      {done ? 'Đã chép ✓' : 'Chép'}
    </button>
  );
}

/** Thông tin chuyển khoản + mã QR VietQR cho một yêu cầu đang chờ duyệt. */
function TransferCard({ topUp, auto }) {
  const t = topUp.transfer;
  if (!t) return null;
  return (
    <div className="transfer">
      <img className="transfer-qr" src={t.qrUrl} alt={`Mã QR chuyển khoản ${formatVnd(t.amountVnd)}, nội dung ${t.content}`} width="260" height="300" />
      <dl className="transfer-info">
        <dt>Ngân hàng</dt>
        <dd>{t.bankName}</dd>
        <dt>Số tài khoản</dt>
        <dd><strong>{t.accountNo}</strong> <CopyButton text={t.accountNo} /></dd>
        <dt>Chủ tài khoản</dt>
        <dd>{t.accountName}</dd>
        <dt>Số tiền</dt>
        <dd><strong>{formatVnd(t.amountVnd)}</strong> <CopyButton text={t.amountVnd} /></dd>
        <dt>Nội dung chuyển khoản</dt>
        <dd><strong className="transfer-code">{t.content}</strong> <CopyButton text={t.content} /></dd>
        <dt>Điểm nhận được</dt>
        <dd>{topUp.points.toLocaleString('vi-VN')} điểm</dd>
      </dl>
      <p className="hint transfer-note">
        Quét mã QR bằng app ngân hàng, hoặc chuyển khoản thủ công và ghi <strong>đúng số tiền và nội dung {t.content}</strong>.{' '}
        {auto
          ? 'Điểm được cộng tự động trong khoảng 1 phút sau khi tiền về, trang này tự cập nhật. Nếu ghi sai nội dung hoặc số tiền, quản trị viên sẽ đối soát và cộng tay.'
          : 'Điểm được cộng sau khi quản trị viên xác nhận đã nhận tiền (trạng thái sẽ chuyển thành “Đã cộng điểm”).'}
      </p>
    </div>
  );
}

export default function TopUpPage() {
  const { settings, refresh } = useAuth();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [approvedNotice, setApprovedNotice] = useState(null);
  const pendingIds = useRef(new Set());
  const cancelledIds = useRef(new Set());

  const loadPending = useCallback(async () => {
    try {
      const data = await api.get('/topups?status=PENDING&pageSize=10');
      setPending(data.items);
      setLoadError(null);
      return data.items;
    } catch (e) {
      setLoadError(e.message);
      return null;
    }
  }, []);

  /** Tải lại danh sách chờ; yêu cầu nào vừa biến mất mà không phải do mình hủy → xem có phải vừa được cộng điểm không. */
  const check = useCallback(async () => {
    const items = await loadPending();
    if (!items) return;
    const now = new Set(items.map((t) => t.id));
    const gone = [...pendingIds.current].filter((id) => !now.has(id) && !cancelledIds.current.has(id));
    pendingIds.current = now;
    if (!gone.length) return;
    try {
      const recent = await api.get('/topups?status=APPROVED&pageSize=20');
      const approved = recent.items.filter((t) => gone.includes(t.id));
      if (approved.length) {
        const pts = approved.reduce((s, t) => s + t.points, 0);
        setApprovedNotice(`Đã nhận tiền (${approved.map((t) => t.code).join(', ')}) — cộng ${pts.toLocaleString('vi-VN')} điểm vào tài khoản.`);
      }
    } catch {
      // Chỉ là thông báo, bỏ qua lỗi mạng.
    }
    refresh().catch(() => {});
  }, [loadPending, refresh]);

  useEffect(() => {
    loadPending().then((items) => {
      pendingIds.current = new Set((items || []).map((t) => t.id));
      setOpenId((id) => id ?? items?.[0]?.id ?? null);
    });
    refresh().catch(() => {});
  }, [loadPending, refresh]);

  // Còn yêu cầu chờ thì tự kiểm tra định kỳ (chỉ khi tab đang mở), để người dùng không phải bấm "Làm mới".
  const auto = Boolean(settings?.topupAuto);
  const hasPending = pending.length > 0;
  useEffect(() => {
    if (!hasPending) return undefined;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') check();
    }, auto ? 8000 : 30000);
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [hasPending, auto, check]);

  if (!settings) return <AccountLayout title="Nạp điểm"><div className="empty">Đang tải…</div></AccountLayout>;
  const { topupUnitVnd: unit, pointsPerUnit, pointsPerExport, topupEnabled } = settings;
  const amountError = amount === '' ? null : validateTopUpAmount(amount, unit);

  const submit = async (e) => {
    e.preventDefault();
    const err = validateTopUpAmount(amount, unit);
    setError(err);
    if (err) return;
    setBusy(true);
    try {
      const { topUp } = await api.post('/topups', { amountVnd: Number(amount) });
      setAmount('');
      setApprovedNotice(null);
      await check();
      setOpenId(topUp.id);
    } catch (e2) {
      setError(e2.errors?.amountVnd || e2.message);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id) => {
    if (!window.confirm('Hủy yêu cầu nạp này? Nếu bạn đã chuyển khoản, đừng hủy — hãy chờ quản trị viên duyệt.')) return;
    cancelledIds.current.add(id);
    try {
      await api.post(`/topups/${id}/cancel`);
    } catch (e) {
      window.alert(e.message);
    }
    check();
  };

  return (
    <AccountLayout title="Nạp điểm">
      <section className="card">
        <h2>Tạo yêu cầu nạp</h2>
        <p className="card-text">
          Tỷ lệ quy đổi: <strong>{formatVnd(unit)} = {pointsPerUnit} điểm</strong>. Mỗi lần xuất file Word/Excel (sau khi hết lượt
          miễn phí) trừ <strong>{pointsPerExport} điểm</strong>. Nạp tối thiểu {formatVnd(unit)}, số tiền là bội số của {formatVnd(unit)}.
        </p>
        {!topupEnabled && (
          <div className="banner banner-alert" role="alert">
            Chức năng nạp điểm tạm thời chưa sẵn sàng. Vui lòng liên hệ quản trị viên.
          </div>
        )}
        <form className="topup-form" onSubmit={submit} noValidate>
          <div className="button-row" role="group" aria-label="Chọn nhanh số tiền">
            {QUICK_MULTIPLES.map((m) => (
              <button
                key={m}
                type="button"
                className={`btn btn-small${Number(amount) === m * unit ? ' btn-primary' : ''}`}
                onClick={() => {
                  setAmount(String(m * unit));
                  setError(null);
                }}
              >
                {formatVnd(m * unit)}
              </button>
            ))}
          </div>
          <label className="field">
            <span>Số tiền (đồng)</span>
            <input
              type="number"
              inputMode="numeric"
              min={unit}
              step={unit}
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError(null);
              }}
              aria-invalid={error || amountError ? 'true' : undefined}
              placeholder={`VD: ${5 * unit}`}
            />
            {(error || amountError) ? (
              <small className="field-error">{error || amountError}</small>
            ) : (
              amount !== '' && (
                <small className="field-hint">
                  Bạn sẽ nhận <strong>{pointsForAmount(amount, unit, pointsPerUnit).toLocaleString('vi-VN')} điểm</strong>.
                </small>
              )
            )}
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy || !topupEnabled}>
            {busy ? 'Đang tạo…' : 'Tạo yêu cầu nạp'}
          </button>
        </form>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Yêu cầu đang chờ duyệt</h2>
          <button type="button" className="btn btn-small" onClick={() => { check(); refresh().catch(() => {}); }}>
            Làm mới
          </button>
        </div>
        {approvedNotice && <div className="banner banner-note" role="status">✓ {approvedNotice}</div>}
        {loadError && <div className="banner banner-alert" role="alert">{loadError}</div>}
        {!pending.length && !loadError && <p className="card-text">Không có yêu cầu nào đang chờ duyệt.</p>}
        <ul className="topup-list">
          {pending.map((t) => (
            <li key={t.id} className="topup-item">
              <div className="topup-row">
                <span className="transfer-code">{t.code}</span>
                <span>{formatVnd(t.amountVnd)} → {t.points.toLocaleString('vi-VN')} điểm</span>
                <span className={`pill ${TOPUP_STATUS[t.status].className}`}>{TOPUP_STATUS[t.status].label}</span>
                <span className="topup-date">{formatDateTime(t.createdAt)}</span>
                <span className="head-actions">
                  <button type="button" className="btn btn-small" onClick={() => setOpenId(openId === t.id ? null : t.id)}>
                    {openId === t.id ? 'Ẩn QR' : 'Xem QR'}
                  </button>
                  <button type="button" className="btn btn-small btn-danger-outline" onClick={() => cancel(t.id)}>
                    Hủy
                  </button>
                </span>
              </div>
              {openId === t.id && <TransferCard topUp={t} auto={auto} />}
            </li>
          ))}
        </ul>
      </section>
    </AccountLayout>
  );
}
