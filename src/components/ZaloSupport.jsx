import { useEffect, useId, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useApp } from '../state/AppContext.jsx';
import { formatDM, isTeachingWeek } from '../lib/calendar.js';

// Số Zalo và giờ hỗ trợ lấy từ .env lúc build. Không có số thì không hiện nút.
const PHONE = (import.meta.env.VITE_ZALO_PHONE || '').trim();
const PHONE_DIGITS = PHONE.replace(/\D/g, '');
const HOURS = (import.meta.env.VITE_SUPPORT_HOURS || '').trim();
const ZALO_URL = PHONE_DIGITS ? `https://zalo.me/${PHONE_DIGITS}` : '';

// Logo Zalo chính thức đặt ở src/assets/zalo-logo.svg (hoặc .png). Chưa có file thì dùng biểu tượng bong bóng chat.
const LOGO = Object.values(
  import.meta.glob('../assets/zalo-logo.{svg,png}', { eager: true, query: '?url', import: 'default' }),
)[0];

const TAB_NAMES = {
  help: 'Hướng dẫn sử dụng',
  lessons: 'Báo giảng',
  timetable: 'Thời khóa biểu',
  calendar: 'Lịch tuần',
  ppct: 'Phân phối chương trình',
  info: 'Thông tin lớp',
};

/** 0912345678 → 0912 345 678 */
function formatPhone(digits) {
  return digits.length === 10 ? digits.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3') : PHONE;
}

function browserName(ua) {
  const rules = [
    [/Edg\/([\d]+)/, 'Edge'],
    [/OPR\/([\d]+)/, 'Opera'],
    [/CocCoc\/([\d]+)|coc_coc_browser\/([\d]+)/, 'Cốc Cốc'],
    [/Zalo\/?([\d]*)/i, 'Zalo (trình duyệt trong app)'],
    [/SamsungBrowser\/([\d]+)/, 'Samsung Internet'],
    [/Firefox\/([\d]+)|FxiOS\/([\d]+)/, 'Firefox'],
    [/Chrome\/([\d]+)|CriOS\/([\d]+)/, 'Chrome'],
    [/Version\/([\d]+).*Safari/, 'Safari'],
  ];
  for (const [re, name] of rules) {
    const m = ua.match(re);
    if (m) {
      const ver = m.slice(1).find(Boolean);
      return ver ? `${name} ${ver}` : name;
    }
  }
  return 'Không rõ';
}

function deviceName(ua) {
  const android = ua.match(/Android ([\d.]+)/);
  if (android) return `Android ${android[1]}${/Mobile/.test(ua) ? ' (điện thoại)' : ' (máy tính bảng)'}`;
  const ios = ua.match(/(iPhone|iPad|iPod).*OS ([\d_]+)/);
  if (ios) return `${ios[1]} iOS ${ios[2].replace(/_/g, '.')}`;
  // iPad đời mới báo là Macintosh nhưng có màn hình cảm ứng.
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return 'iPad';
  if (/Windows NT 10/.test(ua)) return 'Windows 10/11';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Macintosh/.test(ua)) return 'macOS';
  if (/CrOS/.test(ua)) return 'Chromebook';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Không rõ';
}

/** Đoạn thông tin kỹ thuật để dán vào tin nhắn — không chứa dữ liệu kế hoạch hay thông tin cá nhân. */
function buildDebugInfo(state) {
  const week = state.calendar.find((w) => w.id === state.selectedWeekId);
  let weekText = 'Chưa chọn tuần';
  if (week) {
    const label = isTeachingWeek(week) ? `Tuần ${week.num}` : 'Tuần không đánh số';
    const range = week.start && week.end ? ` (${formatDM(week.start)}–${formatDM(week.end)})` : '';
    weekText = label + range;
  }
  const ua = navigator.userAgent;
  return [
    '--- Thông tin lỗi (Kế hoạch giảng dạy) ---',
    `Tuần đang xem: ${weekText}`,
    `Thẻ đang mở: ${TAB_NAMES[state.tab] || state.tab}`,
    `Trình duyệt: ${browserName(ua)}`,
    `Thiết bị: ${deviceName(ua)}, màn hình ${window.innerWidth}×${window.innerHeight}`,
    `Thời điểm: ${new Date().toLocaleString('vi-VN')}`,
  ].join('\n');
}

// Gợi ý "nhắn tin cho chúng tôi": hiện mỗi phiên cho tới khi người dùng mở bảng hỗ trợ lần đầu.
const HINT_SEEN_KEY = 'zalo-support-seen'; // localStorage — đã từng mở bảng hỗ trợ
const HINT_CLOSED_KEY = 'zalo-hint-closed'; // sessionStorage — đã tắt gợi ý trong phiên này
const HINT_DELAY = 1500;
const HINT_DURATION = 15000;

function readFlag(storage, key) {
  // Truy cập window.localStorage có thể ném lỗi khi trình duyệt chặn bộ nhớ, nên để trong try.
  try {
    return window[storage].getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(storage, key) {
  try {
    window[storage].setItem(key, '1');
  } catch {
    /* bộ nhớ trình duyệt bị chặn — bỏ qua */
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    window.prompt('Sao chép nội dung dưới đây:', text);
    return false;
  }
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 3C6.5 3 2 6.9 2 11.7c0 2.6 1.3 4.9 3.4 6.5-.1 1.1-.6 2.3-1.6 3.3 2 0 3.7-.8 4.8-1.7 1.1.3 2.2.5 3.4.5 5.5 0 10-3.9 10-8.6S17.5 3 12 3Zm-4.5 10a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6Zm4.5 0a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6Zm4.5 0a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6Z"
      />
    </svg>
  );
}

export default function ZaloSupport() {
  const { state } = useApp();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(null); // 'phone' | 'debug'
  const rootRef = useRef(null);
  const fabRef = useRef(null);
  const firstRef = useRef(null);
  const titleId = useId();
  // Nút nhấp nháy tới khi người dùng mở bảng hỗ trợ lần đầu.
  const [attention, setAttention] = useState(() => !readFlag('localStorage', HINT_SEEN_KEY));
  const [hint, setHint] = useState(false);

  useEffect(() => {
    if (!attention || readFlag('sessionStorage', HINT_CLOSED_KEY)) return undefined;
    const show = setTimeout(() => setHint(true), HINT_DELAY);
    const hide = setTimeout(() => setHint(false), HINT_DELAY + HINT_DURATION);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [attention]);

  const toggle = () => {
    setOpen((v) => !v);
    setHint(false);
    if (attention) {
      setAttention(false);
      writeFlag('localStorage', HINT_SEEN_KEY);
    }
  };

  const closeHint = () => {
    setHint(false);
    writeFlag('sessionStorage', HINT_CLOSED_KEY);
  };

  useEffect(() => {
    if (!open) return undefined;
    firstRef.current?.focus();
    const onPointer = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        fabRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(null), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  if (!PHONE_DIGITS) return null;

  const copy = async (kind, text) => {
    if (await copyText(text)) setCopied(kind);
  };

  return (
    <div className={`zalo-support${hint && !open ? ' has-hint' : ''}`} ref={rootRef}>
      {hint && !open && (
        <div className="zalo-hint" role="status">
          <button type="button" className="zalo-hint-text" onClick={toggle}>
            Cần hỗ trợ hay có yêu cầu gì? <strong>Nhắn tin cho chúng tôi</strong>
          </button>
          <button type="button" className="zalo-hint-close" aria-label="Ẩn gợi ý" onClick={closeHint}>
            ×
          </button>
          <span className="zalo-hint-hand" aria-hidden="true">
            👉
          </span>
        </div>
      )}

      {open && (
        <div className="zalo-panel" role="dialog" aria-labelledby={titleId}>
          <p className="zalo-title" id={titleId}>
            Cô/thầy có thắc mắc? Nhắn tin cho chúng tôi qua Zalo.
          </p>

          <a
            ref={firstRef}
            className="btn btn-primary zalo-open"
            href={ZALO_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Mở Zalo
          </a>

          <div className="zalo-qr">
            <QRCodeSVG value={ZALO_URL} size={132} marginSize={2} title="Mã QR mở Zalo" />
            <span>Đang dùng máy tính? Quét mã bằng điện thoại.</span>
          </div>

          <div className="zalo-phone">
            <span>
              Số Zalo: <strong>{formatPhone(PHONE_DIGITS)}</strong>
            </span>
            <button type="button" className="btn btn-small" onClick={() => copy('phone', PHONE_DIGITS)}>
              {copied === 'phone' ? 'Đã chép ✓' : 'Sao chép'}
            </button>
          </div>

          {HOURS && <p className="zalo-hours">Giờ hỗ trợ: {HOURS}</p>}

          <button type="button" className="btn zalo-debug" onClick={() => copy('debug', buildDebugInfo(state))}>
            {copied === 'debug' ? 'Đã chép ✓ — dán vào tin nhắn Zalo' : 'Sao chép thông tin lỗi'}
          </button>
          <p className="zalo-note">Chỉ gồm tuần, thẻ đang mở, trình duyệt và thiết bị — không có dữ liệu kế hoạch.</p>
        </div>
      )}

      <button
        ref={fabRef}
        type="button"
        className={`zalo-fab${LOGO ? ' has-logo' : ''}${attention && !open ? ' is-pulsing' : ''}`}
        aria-label="Hỗ trợ qua Zalo"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={toggle}
      >
        {LOGO ? <img src={LOGO} alt="" /> : <ChatIcon />}
        <span className="zalo-tip" aria-hidden="true">
          Hỗ trợ qua Zalo
        </span>
      </button>
    </div>
  );
}
