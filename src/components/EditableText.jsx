import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Ô chữ sửa trực tiếp: tự giãn chiều cao, lưu khi rời ô, Esc để bỏ phần đang gõ.
 */
export default function EditableText({ value, onCommit, placeholder, ariaLabel, className = '' }) {
  const [draft, setDraft] = useState(value);
  const ref = useRef(null);

  useEffect(() => setDraft(value), [value]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  const commit = () => {
    const next = draft.replace(/\s+$/g, '');
    if (next !== value) onCommit(next);
  };

  return (
    <textarea
      ref={ref}
      rows={1}
      className={`cell-edit ${className}`}
      value={draft}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setDraft(value);
          e.currentTarget.blur();
        } else if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}
