import { useEffect, useState } from 'react';
import FormDialog from './FormDialog.jsx';

const STORAGE_KEY = 'export-orientation';

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

/** Hỏi hướng giấy trước khi xuất file Word / Excel. onSubmit(orientation). */
export default function OrientationDialog({ open, kindLabel, onSubmit, onCancel }) {
  const [value, setValue] = useState(loadOrientation);
  useEffect(() => {
    if (open) setValue(loadOrientation());
  }, [open]);

  return (
    <FormDialog
      open={open}
      title="Cô muốn xuất khổ giấy nào?"
      submitLabel="Xuất file"
      onSubmit={() => {
        saveOrientation(value);
        onSubmit(value);
      }}
      onCancel={onCancel}
    >
      {kindLabel && <p>File {kindLabel} sẽ được tạo theo khổ giấy bên dưới.</p>}
      <div className="orient-options" role="radiogroup" aria-label="Khổ giấy">
        {ORIENTATIONS.map((o) => (
          <label key={o.id} className={`orient-option${value === o.id ? ' is-active' : ''}`}>
            <input
              type="radio"
              name="export-orientation"
              value={o.id}
              checked={value === o.id}
              onChange={() => setValue(o.id)}
            />
            <span className={`orient-page orient-page-${o.id}`} aria-hidden="true" />
            <span className="orient-text">
              <strong>{o.label}</strong>
              <small>{o.hint}</small>
            </span>
          </label>
        ))}
      </div>
    </FormDialog>
  );
}
