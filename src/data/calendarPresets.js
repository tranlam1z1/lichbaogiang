// Lịch tuần mẫu theo năm học — chọn trong trang "Lịch tuần" để thay nhanh cả năm.
import calendar20252026 from './calendar-2025-2026.json';
import calendar20262027 from './calendar.json';

export const CALENDAR_PRESETS = [
  { schoolYear: '2025 - 2026', calendar: calendar20252026 },
  { schoolYear: '2026 - 2027', calendar: calendar20262027 },
];
