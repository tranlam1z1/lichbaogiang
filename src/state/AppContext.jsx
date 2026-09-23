import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import ppctData from '../data/ppct.json';
import defaults from '../data/defaults.json';
import { reducer, hydrate, STORAGE_KEY } from './reducer.js';
import { buildPpctIndex } from '../lib/ppct.js';

const AppContext = createContext(null);

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return hydrate(raw ? JSON.parse(raw) : null);
  } catch {
    return hydrate(null);
  }
}

// Chỉ mục PPCT dựng một lần cho mỗi khối.
const indexCache = new Map();
export function getPpctIndex(grade) {
  const g = String(grade);
  if (!indexCache.has(g)) indexCache.set(g, buildPpctIndex(ppctData[g] || []));
  return indexCache.get(g);
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);
  const [saveError, setSaveError] = useState(null);
  const timer = useRef(null);

  // Tự động lưu vào localStorage (gom các thay đổi liên tiếp trong 300ms).
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        setSaveError(null);
      } catch (e) {
        setSaveError('Không lưu được vào trình duyệt. Hãy sao lưu ra file .json ở mục Thông tin lớp.');
      }
    }, 300);
    return () => clearTimeout(timer.current);
  }, [state]);

  const value = useMemo(() => {
    const grade = state.info.grade;
    const index = getPpctIndex(grade);
    const suggestions = Array.from(new Set([...index.subjects, ...defaults.subjectCatalog])).sort((a, b) =>
      a.localeCompare(b, 'vi'),
    );
    return {
      state,
      dispatch,
      grade,
      index,
      ppctOverrides: state.ppctOverrides[grade] || {},
      subjectSuggestions: suggestions,
      saveError,
    };
  }, [state, saveError]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp phải dùng bên trong <AppProvider>');
  return ctx;
}
