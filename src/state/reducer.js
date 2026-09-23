// Reducer thuần (không phụ thuộc React) — dễ kiểm thử bằng node --test.

import defaults from '../data/defaults.json';
import calendarData from '../data/calendar.json';
import { findCurrentWeek, newWeekId, addDays } from '../lib/calendar.js';
import { normalizeSubject } from '../lib/text.js';
import { MAX_PERIODS } from '../lib/schedule.js';

export const STORAGE_KEY = 'lich-bao-giang/v1';
export const STATE_VERSION = 1;

const clone = (x) => JSON.parse(JSON.stringify(x));

export function createInitialState() {
  const calendar = clone(calendarData);
  return {
    version: STATE_VERSION,
    info: clone(defaults.info),
    timetable: clone(defaults.timetable),
    calendar,
    lessonOverrides: {},
    ppctOverrides: {},
    checkRules: {},
    selectedWeekId: findCurrentWeek(calendar)?.id ?? null,
    tab: 'lessons',
  };
}

/** Ghép dữ liệu đã lưu / file sao lưu với cấu trúc mặc định để tránh thiếu trường. */
export function hydrate(saved) {
  const base = createInitialState();
  if (!saved || typeof saved !== 'object') return base;
  const s = saved.data && saved.app === 'lich-bao-giang' ? saved.data : saved;
  const state = {
    ...base,
    info: { ...base.info, ...(s.info || {}) },
    timetable: { ...base.timetable, ...(s.timetable || {}), days: { ...base.timetable.days, ...(s.timetable?.days || {}) } },
    calendar: Array.isArray(s.calendar) && s.calendar.length ? s.calendar : base.calendar,
    lessonOverrides: s.lessonOverrides && typeof s.lessonOverrides === 'object' ? s.lessonOverrides : {},
    ppctOverrides: s.ppctOverrides && typeof s.ppctOverrides === 'object' ? s.ppctOverrides : {},
    checkRules: s.checkRules && typeof s.checkRules === 'object' ? s.checkRules : {},
    tab: s.tab || base.tab,
  };
  state.info.grade = Number(state.info.grade) || base.info.grade;
  const stillExists = state.calendar.some((w) => w.id === s.selectedWeekId);
  state.selectedWeekId = stillExists ? s.selectedWeekId : findCurrentWeek(state.calendar)?.id ?? null;
  return state;
}

/** Nội dung file sao lưu .json. */
export function toBackup(state) {
  const { tab, ...data } = state;
  return { app: 'lich-bao-giang', version: STATE_VERSION, savedAt: new Date().toISOString(), data };
}

function ensureDay(days, day) {
  const d = days[day] || { morning: [], afternoon: [] };
  return {
    morning: Array.from({ length: MAX_PERIODS }, (_, i) => d.morning?.[i] || ''),
    afternoon: Array.from({ length: MAX_PERIODS }, (_, i) => d.afternoon?.[i] || ''),
  };
}

export function reducer(state, action) {
  switch (action.type) {
    case 'SET_TAB':
      return { ...state, tab: action.tab };

    case 'SELECT_WEEK':
      return { ...state, selectedWeekId: action.id };

    case 'SET_INFO': {
      const info = { ...state.info, ...action.patch };
      if ('grade' in action.patch) info.grade = Number(action.patch.grade) || state.info.grade;
      return { ...state, info };
    }

    // ---------- Thời khóa biểu ----------
    case 'SET_TIMETABLE_CELL': {
      const { day, session, period, value } = action;
      const days = { ...state.timetable.days };
      const d = ensureDay(days, day);
      // Chỉ viết hoa khi gõ (giữ dấu cách); chuẩn hóa đầy đủ khi tra cứu.
      d[session][period - 1] = String(value ?? '').toLocaleUpperCase('vi');
      days[day] = d;
      return { ...state, timetable: { ...state.timetable, days } };
    }
    case 'SET_TIMETABLE_OPTION':
      return { ...state, timetable: { ...state.timetable, ...action.patch } };
    case 'RESET_TIMETABLE':
      return { ...state, timetable: clone(defaults.timetable) };

    // ---------- Sửa tên bài / đồ dùng trong một tuần ----------
    case 'SET_LESSON': {
      const { weekNum, slotKey, subject, field, value, base = '' } = action;
      const week = { ...(state.lessonOverrides[weekNum] || {}) };
      const cell = { ...(week[slotKey] || {}), subject: normalizeSubject(subject) };
      if (cell.subject !== normalizeSubject(week[slotKey]?.subject)) {
        delete cell.title;
        delete cell.equipment;
      }
      const clean = (value ?? '').toString();
      if (clean === base) delete cell[field];
      else cell[field] = clean;
      if (cell.title == null && cell.equipment == null) delete week[slotKey];
      else week[slotKey] = cell;
      const lessonOverrides = { ...state.lessonOverrides, [weekNum]: week };
      if (!Object.keys(week).length) delete lessonOverrides[weekNum];
      return { ...state, lessonOverrides };
    }
    case 'RESET_LESSON':
      return reducer(state, { ...action, type: 'SET_LESSON', value: action.base ?? '', base: action.base ?? '' });
    case 'RESET_WEEK_LESSONS': {
      const lessonOverrides = { ...state.lessonOverrides };
      delete lessonOverrides[action.weekNum];
      return { ...state, lessonOverrides };
    }

    // ---------- Lịch tuần ----------
    case 'UPDATE_WEEK':
      return {
        ...state,
        calendar: state.calendar.map((w) => (w.id === action.id ? { ...w, ...action.patch } : w)),
      };
    case 'ADD_WEEK': {
      const i = state.calendar.findIndex((w) => w.id === action.afterId);
      const prev = state.calendar[i] || state.calendar[state.calendar.length - 1];
      const start = prev ? addDays(prev.start, 7) : new Date().toISOString().slice(0, 10);
      const row = {
        id: newWeekId(),
        num: prev && Number.isInteger(prev.num) ? prev.num + 1 : null,
        note: '',
        semester: prev?.semester || 'I',
        start,
        end: addDays(start, 4),
      };
      const calendar = [...state.calendar];
      calendar.splice(i < 0 ? calendar.length : i + 1, 0, row);
      return { ...state, calendar };
    }
    case 'REMOVE_WEEK': {
      const calendar = state.calendar.filter((w) => w.id !== action.id);
      const selectedWeekId = state.selectedWeekId === action.id
        ? findCurrentWeek(calendar)?.id ?? null
        : state.selectedWeekId;
      return { ...state, calendar, selectedWeekId };
    }
    case 'REPLACE_CALENDAR':
      return { ...state, calendar: action.calendar, selectedWeekId: findCurrentWeek(action.calendar)?.id ?? null };

    // ---------- Sửa tên bài trong PPCT ----------
    case 'SET_PPCT_NAME': {
      const { grade, key, name, original } = action;
      const g = { ...(state.ppctOverrides[grade] || {}) };
      if (name === original) delete g[key];
      else g[key] = name;
      return { ...state, ppctOverrides: { ...state.ppctOverrides, [grade]: g } };
    }
    case 'RESET_PPCT_NAME': {
      const g = { ...(state.ppctOverrides[action.grade] || {}) };
      delete g[action.key];
      return { ...state, ppctOverrides: { ...state.ppctOverrides, [action.grade]: g } };
    }
    case 'RESET_PPCT_ALL':
      return { ...state, ppctOverrides: { ...state.ppctOverrides, [action.grade]: {} } };

    // ---------- Định mức tiết/tuần trong bảng đối chiếu ----------
    case 'SET_CHECK_RULE': {
      // patch: {perWeek?: number | null, hidden?: boolean}; null / false = bỏ phần đã đặt.
      const subject = normalizeSubject(action.subject);
      if (!subject) return state;
      const g = { ...(state.checkRules[action.grade] || {}) };
      const rule = { ...(g[subject] || {}), ...action.patch };
      if (!Number.isFinite(rule.perWeek)) delete rule.perWeek;
      if (!rule.hidden) delete rule.hidden;
      if (Object.keys(rule).length) g[subject] = rule;
      else delete g[subject];
      return { ...state, checkRules: { ...state.checkRules, [action.grade]: g } };
    }
    case 'REMOVE_CHECK_RULE': {
      const g = { ...(state.checkRules[action.grade] || {}) };
      delete g[normalizeSubject(action.subject)];
      return { ...state, checkRules: { ...state.checkRules, [action.grade]: g } };
    }
    case 'RESET_CHECK_RULES':
      return { ...state, checkRules: { ...state.checkRules, [action.grade]: {} } };

    // ---------- Sao lưu ----------
    case 'RESTORE':
      return { ...hydrate(action.data), tab: state.tab };
    case 'RESET_ALL':
      return { ...createInitialState(), tab: state.tab };

    default:
      return state;
  }
}
