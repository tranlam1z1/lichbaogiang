import { useEffect, useMemo, useState } from 'react';
import FormDialog from './FormDialog.jsx';
import { RANGE_OPTIONS, weeksInRange } from '../lib/range.js';
import { isTeachingWeek } from '../lib/calendar.js';
import { quoteExport } from '../../shared/pricing.js';

const STORAGE_KEY = 'export-orientation';
const EQUIPMENT_KEY = 'export-equipment';
const INTEGRATION_KEY = 'export-integration';
const SIGNATURE_KEY = 'export-signature';

export const ORIENTATIONS = [
  { id: 'portrait', label: 'Khổ dọc', hint: 'A4 dọc' },
  { id: 'landscape', label: 'Khổ ngang', hint: 'A4 ngang' },
];

/** Hướng giấy đã chọn lần trước (mặc định: dọc). */
export function loadOrientation() {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return ORIENTATIONS.some((o) => o.id === v) ? v : 'portrait';
  } catch {
    return 'portrait';
  }
}

function saveOrientation(value) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Trình duyệt chặn lưu trữ: bỏ qua, lần sau dùng mặc định.
  }
}

/** Lựa chọn bật/tắt đã lưu lần trước; chưa lưu lần nào thì dùng fallback (mặc định: bật). */
function loadToggle(key, fallback = true) {
  try {
    const v = window.localStorage.getItem(key);
    return v === 'on' || v === 'off' ? v === 'on' : fallback;
  } catch {
    return fallback;
  }
}

function saveToggle(key, value) {
  try {
    window.localStorage.setItem(key, value ? 'on' : 'off');
  } catch {
    // Trình duyệt chặn lưu trữ: bỏ qua, lần sau dùng mặc định.
  }
}

/** Lần trước có tải cột "Đồ dùng dạy học" không (mặc định: có). */
const loadEquipment = () => loadToggle(EQUIPMENT_KEY);
/** Lần trước có tải cột "Nội dung tích hợp" không (mặc định: không). */
const loadIntegration = () => loadToggle(INTEGRATION_KEY, false);
/** Lần trước có tải phần ký tên Giáo viên / Tổ trưởng không (mặc định: có). */
const loadSignature = () => loadToggle(SIGNATURE_KEY);

const fmt = (n) => n.toLocaleString('vi-VN');

/** "Tuần 5", "Tuần 1–18" hoặc "Không có tuần học". */
function weeksText(weeks) {
  if (!weeks.length) return 'Không có tuần học';
  if (weeks.length === 1) return `Tuần ${weeks[0].num}`;
  return `Tuần ${weeks[0].num}–${weeks[weeks.length - 1].num}`;
}

const priceLabel = (q) => {
  if (!q.weeks) return '—';
  return q.free ? 'Miễn phí (1 lượt)' : `${fmt(q.cost)} điểm`;
};

/**
 * Hỏi phạm vi tuần + khổ giấy + có tải cột đồ dùng / cột nội dung tích hợp / phần ký tên không trước khi xuất, hiện giá từng phạm vi và tổng điểm phải trả.
 * onSubmit({ range, weeks, orientation, equipment, integration, signature, quote }) — quote.enough = false nghĩa là người dùng bấm "Nạp điểm".
 */
export default function ExportDialog({ open, kindLabel, calendar, currentWeek, initialRange, user, settings, busy, error, onSubmit, onCancel }) {
  const [range, setRange] = useState(initialRange);
  const [orientation, setOrientation] = useState(loadOrientation);
  const [equipment, setEquipment] = useState(loadEquipment);
  const [integration, setIntegration] = useState(loadIntegration);
  const [signature, setSignature] = useState(loadSignature);
  useEffect(() => {
    if (!open) return;
    setRange(initialRange);
    setOrientation(loadOrientation());
    setEquipment(loadEquipment());
    setIntegration(loadIntegration());
    setSignature(loadSignature());
  }, [open, initialRange]);

  const teaching = useMemo(() => calendar.filter(isTeachingWeek), [calendar]);
  const lastNum = teaching.length ? teaching[teaching.length - 1].num : 1;
  const options = useMemo(
    () => RANGE_OPTIONS.map((o) => {
      const weeks = weeksInRange(calendar, { ...range, type: o.id }, currentWeek?.id);
      return { ...o, weeks, quote: quoteExport(weeks.length, user, settings || {}) };
    }),
    [calendar, range, currentWeek?.id, user, settings],
  );
  const chosen = options.find((o) => o.id === range.type) || options[0];
  const { weeks, quote } = chosen;
  const extra = settings?.pointsPerExtraWeek || 0;

  let submitLabel = 'Tải file';
  if (!weeks.length) submitLabel = 'Tải file';
  else if (quote.free) submitLabel = 'Tải (dùng 1 lượt miễn phí)';
  else if (!quote.enough) submitLabel = 'Nạp điểm';
  else if (quote.cost > 0) submitLabel = `Trừ ${fmt(quote.cost)} điểm và tải`;

  return (
    <FormDialog
      open={open}
      title={`Tải file ${kindLabel}`}
      submitLabel={submitLabel}
      busy={busy}
      error={error}
      submitDisabled={!weeks.length}
      onSubmit={() => {
        saveOrientation(orientation);
        saveToggle(EQUIPMENT_KEY, equipment);
        saveToggle(INTEGRATION_KEY, integration);
        saveToggle(SIGNATURE_KEY, signature);
        onSubmit({ range, weeks, orientation, equipment, integration, signature, quote });
      }}
      onCancel={onCancel}
    >
      <fieldset className="export-fieldset">
        <legend>Cô muốn tải phạm vi nào?</legend>
        <div className="range-options" role="radiogroup" aria-label="Phạm vi">
          {options.map((o) => (
            <label key={o.id} className={`range-option${range.type === o.id ? ' is-active' : ''}${o.weeks.length ? '' : ' is-empty'}`}>
              <input
                type="radio"
                name="export-range"
                value={o.id}
                checked={range.type === o.id}
                onChange={() => setRange({ ...range, type: o.id })}
              />
              <span className="range-text">
                <strong>{o.label}</strong>
                <small>
                  {weeksText(o.weeks)}
                  {o.weeks.length > 1 && ` · ${o.weeks.length} tuần`}
                </small>
              </span>
              <span className={`range-price${o.quote.free ? ' is-free' : ''}`}>{priceLabel(o.quote)}</span>
            </label>
          ))}
        </div>
        {range.type === 'custom' && (
          <div className="range-custom">
            <label className="field field-inline">
              <span>Từ tuần</span>
              <input type="number" min="1" max={lastNum} inputMode="numeric" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
            </label>
            <label className="field field-inline">
              <span>đến tuần</span>
              <input type="number" min="1" max={lastNum} inputMode="numeric" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
            </label>
          </div>
        )}
      </fieldset>

      <fieldset className="export-fieldset">
        <legend>Khổ giấy</legend>
        <div className="orient-options" role="radiogroup" aria-label="Khổ giấy">
          {ORIENTATIONS.map((o) => (
            <label key={o.id} className={`orient-option${orientation === o.id ? ' is-active' : ''}`}>
              <input
                type="radio"
                name="export-orientation"
                value={o.id}
                checked={orientation === o.id}
                onChange={() => setOrientation(o.id)}
              />
              <span className={`orient-page orient-page-${o.id}`} aria-hidden="true" />
              <span className="orient-text">
                <strong>{o.label}</strong>
                <small>{o.hint}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="export-fieldset">
        <legend>Nội dung trong file</legend>
        <label className="check">
          <input type="checkbox" checked={equipment} onChange={(e) => setEquipment(e.target.checked)} />
          <span>Tải cột "Đồ dùng dạy học"</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={integration} onChange={(e) => setIntegration(e.target.checked)} />
          <span>Tải cột "Nội dung tích hợp"</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={signature} onChange={(e) => setSignature(e.target.checked)} />
          <span>Tải phần ký tên Giáo viên, Tổ trưởng chuyên môn</span>
        </label>
      </fieldset>

      <div className={`export-total${weeks.length && !quote.free && !quote.enough ? ' is-short' : ''}`} aria-live="polite">
        {!weeks.length ? (
          <p>Phạm vi đã chọn không có tuần học nào.</p>
        ) : quote.free ? (
          <p>
            Tổng: <strong>miễn phí</strong> — dùng 1 lượt, còn {quote.freeAfter} lượt sau lần này.
          </p>
        ) : (
          <>
            <p>
              Tổng: <strong>{fmt(quote.cost)} điểm</strong> cho {weeks.length} tuần
              {weeks.length > 1 && extra > 0 && (
                <span className="export-breakdown"> ({settings.pointsPerExport} điểm tuần đầu + {weeks.length - 1} × {extra} điểm)</span>
              )}
            </p>
            <p>
              {quote.enough
                ? <>Bạn có {fmt(user.points)} điểm → còn <strong>{fmt(quote.pointsAfter)} điểm</strong> sau khi tải.</>
                : <>Bạn có {fmt(user.points)} điểm, còn thiếu <strong>{fmt(-quote.pointsAfter)} điểm</strong>.</>}
            </p>
            {weeks.length > 1 && user.freeExportsLeft > 0 && (
              <p className="export-note">Lượt miễn phí chỉ dùng khi tải 1 tuần (bạn còn {user.freeExportsLeft} lượt).</p>
            )}
          </>
        )}
      </div>
    </FormDialog>
  );
}
