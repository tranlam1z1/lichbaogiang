import { useApp } from './state/AppContext.jsx';
import HelpPage from './components/HelpPage.jsx';
import LessonsPage from './components/LessonsPage.jsx';
import TimetableEditor from './components/TimetableEditor.jsx';
import WeekCalendar from './components/WeekCalendar.jsx';
import PpctTable from './components/PpctTable.jsx';
import ClassInfo from './components/ClassInfo.jsx';
import UserBar from './components/UserBar.jsx';
import SaveStatus from './components/SaveStatus.jsx';
import ZaloSupport from './components/ZaloSupport.jsx';

const TABS = [
  { id: 'help', label: 'Hướng dẫn sử dụng', short: 'Hướng dẫn', icon: '?' },
  // Theo thứ tự các bước trong hướng dẫn sử dụng (docs/HUONG_DAN_SU_DUNG.md).
  { id: 'info', label: 'Thông tin lớp', short: 'Lớp', icon: '⌂' },
  { id: 'timetable', label: 'Thời khóa biểu', short: 'TKB', icon: '▦' },
  { id: 'calendar', label: 'Lịch tuần', short: 'Lịch tuần', icon: '◷' },
  { id: 'lessons', label: 'Báo giảng', short: 'Báo giảng', icon: '✎' },
  { id: 'ppct', label: 'Phân phối chương trình', short: 'PPCT', icon: '☰' },
];

export default function App() {
  const { state, dispatch } = useApp();
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
            <SaveStatus />
            <UserBar />
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

      <main className="page">
        {tab === 'help' && <HelpPage />}
        {tab === 'lessons' && <LessonsPage />}
        {tab === 'timetable' && <TimetableEditor />}
        {tab === 'calendar' && <WeekCalendar />}
        {tab === 'ppct' && <PpctTable />}
        {tab === 'info' && <ClassInfo />}
      </main>

      <ZaloSupport />
    </div>
  );
}
