import { useApp } from './state/AppContext.jsx';
import LessonsPage from './components/LessonsPage.jsx';
import TimetableEditor from './components/TimetableEditor.jsx';
import WeekCalendar from './components/WeekCalendar.jsx';
import PpctTable from './components/PpctTable.jsx';
import ClassInfo from './components/ClassInfo.jsx';

const TABS = [
  { id: 'lessons', label: 'Báo giảng', short: 'Báo giảng', icon: '✎' },
  { id: 'timetable', label: 'Thời khóa biểu', short: 'TKB', icon: '▦' },
  { id: 'calendar', label: 'Lịch tuần', short: 'Lịch tuần', icon: '◷' },
  { id: 'ppct', label: 'Phân phối chương trình', short: 'PPCT', icon: '☰' },
  { id: 'info', label: 'Thông tin lớp', short: 'Lớp', icon: '⌂' },
];

export default function App() {
  const { state, dispatch, saveError } = useApp();
  const { info, tab } = state;

  return (
    <div className="app">
      <header className="masthead">
        <div className="masthead-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">{info.className || '—'}</span>
            <div>
              <h1>Kế hoạch giảng dạy</h1>
              <p className="brand-sub">
                {info.school} · Năm học {info.schoolYear}
              </p>
            </div>
          </div>
          <nav className="tabs" aria-label="Các mục">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`tab${tab === t.id ? ' is-active' : ''}`}
                aria-current={tab === t.id ? 'page' : undefined}
                onClick={() => dispatch({ type: 'SET_TAB', tab: t.id })}
              >
                <span className="tab-icon" aria-hidden="true">{t.icon}</span>
                <span className="tab-long">{t.label}</span>
                <span className="tab-short">{t.short}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      {saveError && <div className="banner banner-error" role="alert">{saveError}</div>}

      <main className="page">
        {tab === 'lessons' && <LessonsPage />}
        {tab === 'timetable' && <TimetableEditor />}
        {tab === 'calendar' && <WeekCalendar />}
        {tab === 'ppct' && <PpctTable />}
        {tab === 'info' && <ClassInfo />}
      </main>
    </div>
  );
}
