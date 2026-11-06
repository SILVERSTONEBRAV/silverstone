import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Icon, type IconName } from './Icon';
import { clearLocalState, createId, createInitialState, loadLocalState, localDateKey, saveLocalState } from './store';
import type { AgentTask, CaptureItem, LocalAppState, PageKey, StudyGoal, StudySession, TaskCategory } from './types';
import { createSpeechRecognizer, listSpeechVoices, speakText, stopSpeaking, type SpeechRecognizer } from './voice';

type ModalMode = 'task' | 'capture' | null;
type Theme = 'light' | 'dark';

const navigation: { label: string; items: { key: PageKey; label: string; icon: IconName }[] }[] = [
  {
    label: 'WORKSPACE',
    items: [
      { key: 'today', label: 'Today', icon: 'home' },
      { key: 'study', label: 'Study', icon: 'book' },
      { key: 'career', label: 'Career', icon: 'briefcase' },
      { key: 'portfolio', label: 'Portfolio', icon: 'layers' },
      { key: 'studio', label: 'Studio', icon: 'sparkles' },
    ],
  },
  {
    label: 'PERSONAL SPACE',
    items: [
      { key: 'library', label: 'Library', icon: 'library' },
      { key: 'observation', label: 'Observation', icon: 'scan' },
      { key: 'activity', label: 'Activity', icon: 'activity' },
    ],
  },
];

const pageCopy: Record<Exclude<PageKey, 'today' | 'settings'>, { title: string; subtitle: string; eyebrow: string }> = {
  study: { title: 'Study, with intention.', subtitle: 'Build a steady rhythm around the time and energy you actually have.', eyebrow: 'LEARNING SPACE' },
  career: { title: 'Move your next step forward.', subtitle: 'Keep opportunities, applications, and evidence in one calm place.', eyebrow: 'CAREER SPACE' },
  portfolio: { title: 'Show the work behind the work.', subtitle: 'Shape project notes into clear, evidence-backed case studies.', eyebrow: 'YOUR PORTFOLIO' },
  studio: { title: 'Make your ideas travel.', subtitle: 'Develop thoughtful content and prepare it for each channel.', eyebrow: 'CREATOR STUDIO' },
  library: { title: 'Everything worth keeping.', subtitle: 'A searchable home for your notes, links, references, and captures.', eyebrow: 'PERSONAL LIBRARY' },
  observation: { title: 'Context, on your terms.', subtitle: 'Choose what Silverstone can observe and exactly what it may do with that context.', eyebrow: 'OBSERVATION MODE' },
  activity: { title: 'A clear record of what happened.', subtitle: 'Review local changes, suggestions, approvals, and workflow outcomes.', eyebrow: 'YOUR ACTIVITY' },
};

const demoEvents = [
  { time: '09:12', title: 'Daily plan opened', detail: 'Today workspace · local', tone: 'blue' },
  { time: '08:54', title: 'Study goal reviewed', detail: 'Rust ownership · 4 topics queued', tone: 'violet' },
  { time: 'Yesterday', title: 'Portfolio note captured', detail: 'Case study · saved on this device', tone: 'green' },
];

const opportunityRows = [
  { name: 'Atlas Future Leaders', type: 'Scholarship', stage: 'Essay draft', due: 'Nov 14', tone: 'violet' },
  { name: 'Northstar Labs', type: 'Product internship', stage: 'Application prep', due: 'Nov 19', tone: 'blue' },
  { name: 'Open Horizons Grant', type: 'Fellowship', stage: 'Requirements review', due: 'Nov 26', tone: 'amber' },
];

function todayLabel() {
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function recommendedStudyBlock(goal: StudyGoal | null): number {
  if (!goal || goal.availabilityDate !== localDateKey() || goal.availableMinutesToday <= 0) return 0;
  return Math.min(25, goal.availableMinutesToday, Math.max(5, Math.ceil(goal.weeklyTargetMinutes / 5)));
}

function App() {
  const [appState, setAppState] = useState<LocalAppState>(createInitialState);
  const [storageReady, setStorageReady] = useState(false);
  const [activePage, setActivePage] = useState<PageKey>('today');
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [focusDetails, setFocusDetails] = useState({ title: 'Focused work', minutes: 25, studyGoalId: '' });
  const [studyGoalOpen, setStudyGoalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const current = window.localStorage.getItem('silverstone.theme');
      const previous = window.localStorage.getItem('orbit.theme');
      if (!current && previous) {
        window.localStorage.setItem('silverstone.theme', previous);
        window.localStorage.removeItem('orbit.theme');
      }
      return (current ?? previous) === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  const [toast, setToast] = useState('');

  useEffect(() => {
    let active = true;
    void loadLocalState().then((state) => {
      if (!active) return;
      setAppState(state);
      setStorageReady(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const updateConnection = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
    return () => {
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
    };
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    void saveLocalState(appState).catch(() => setToast('Could not save this change in browser storage.'));
  }, [appState, storageReady]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem('silverstone.theme', theme);
    } catch {
      // Theme changes still apply for this session if storage is unavailable.
    }
  }, [theme]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === 'Escape') {
        setSearchOpen(false);
        setVoiceOpen(false);
        setModalMode(null);
        setStudyGoalOpen(false);
        setFocusOpen(false);
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const completedTasks = appState.tasks.filter((task) => task.done).length;
  const openTasks = appState.tasks.filter((task) => !task.done);
  const searchShortcut = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘ K' : 'Ctrl K';

  function navigate(page: PageKey) {
    setActivePage(page);
    setMobileMenuOpen(false);
  }

  function addTask(title: string, category: TaskCategory) {
    const task: AgentTask = {
      id: createId('task'),
      title,
      category,
      dueLabel: 'Today',
      done: false,
    };
    setAppState((current) => ({ ...current, tasks: [task, ...current.tasks] }));
    setModalMode(null);
    setToast('Task added to your local workspace');
  }

  function startFocusSession(title = 'Focused work', minutes = 25, studyGoalId = '') {
    setFocusDetails({ title, minutes, studyGoalId });
    setFocusOpen(true);
  }

  function saveStudyGoal(goal: StudyGoal) {
    setAppState((current) => ({ ...current, studyGoal: goal }));
    setStudyGoalOpen(false);
    setToast('Study goal saved on this device');
  }

  function completeFocusSession() {
    if (!focusDetails.studyGoalId) return;
    const session: StudySession = {
      id: createId('study-session'),
      goalId: focusDetails.studyGoalId,
      topic: focusDetails.title,
      plannedMinutes: focusDetails.minutes,
      completedAt: new Date().toISOString(),
    };
    setAppState((current) => ({ ...current, studySessions: [session, ...current.studySessions] }));
    setToast('Study session completed and logged');
  }

  function addCapture(text: string, modality: 'text' | 'voice' = 'text') {
    const capture: CaptureItem = {
      id: createId('capture'),
      text,
      kind: 'Note',
      createdAt: new Date().toISOString(),
      modality,
      sourceSurface: 'web-app',
      context: 'Personal',
      origin: 'user-entered',
      sensitivity: 'personal',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'local',
      language: typeof navigator !== 'undefined' ? navigator.language : 'und',
      retention: 'local-until-deleted',
    };
    setAppState((current) => ({ ...current, captures: [capture, ...current.captures] }));
    setModalMode(null);
    setToast('Capture saved on this device');
  }

  function toggleTask(id: string) {
    setAppState((current) => ({
      ...current,
      tasks: current.tasks.map((task) => task.id === id ? { ...task, done: !task.done } : task),
    }));
  }

  async function resetWorkspace() {
    try {
      await clearLocalState();
      setAppState({ version: 2, tasks: [], captures: [], studyGoal: null, studySessions: [] });
      setToast('Local workspace data cleared');
    } catch {
      setToast('Could not clear saved data. Browser storage is unavailable.');
    }
  }

  if (!storageReady) {
    return (
      <div className="startup-screen" role="status" aria-live="polite">
        <div className="startup-card">
          <div className="startup-mark"><span /><span /><span /></div>
          <strong>Opening Silverstone</strong>
          <span>Restoring your local workspace…</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-shell ${theme === 'dark' ? 'theme-dark' : ''}`}>
      <Sidebar
        activePage={activePage}
        open={mobileMenuOpen}
        onNavigate={navigate}
        onClose={() => setMobileMenuOpen(false)}
      />
      {mobileMenuOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileMenuOpen(false)} />}
      <div className="app-main">
        <header className="topbar">
          <button className="icon-button mobile-menu-button" aria-label="Open navigation" onClick={() => setMobileMenuOpen(true)}>
            <Icon name="menu" />
          </button>
          <button className="search-trigger" onClick={() => setSearchOpen(true)} aria-label="Search your workspace">
            <Icon name="search" size={17} />
            <span>Search anything</span>
            <kbd>{searchShortcut}</kbd>
          </button>
          <div className="topbar-right">
            <span className={`local-status ${isOnline ? '' : 'local-status-offline'}`}><span className="status-dot" /> {isOnline ? 'Local workspace' : 'Offline · local data'}</span>
            <button className="icon-button notification-button" aria-label="Notifications" onClick={() => setToast('No new reminders in this local preview')}>
              <Icon name="bell" size={18} />
              <span className="notification-dot" />
            </button>
            <button className="icon-button voice-trigger" aria-label="Talk to Silverstone" title="Talk to Silverstone" onClick={() => setVoiceOpen(true)}>
              <Icon name="mic" size={18} />
            </button>
            <button className="avatar-button" aria-label="Open profile and settings" onClick={() => navigate('settings')}>P</button>
          </div>
        </header>

        <main className="page-content">
          {activePage === 'today' ? (
            <TodayPage
              tasks={appState.tasks}
              studyGoal={appState.studyGoal}
              openTasks={openTasks}
              completedTasks={completedTasks}
              onToggleTask={toggleTask}
              onStartFocus={() => startFocusSession()}
              onStartStudy={(title, minutes, goalId) => startFocusSession(title, minutes, goalId)}
              onAddTask={() => setModalMode('task')}
              onCapture={() => setModalMode('capture')}
              onNavigate={navigate}
              onToast={setToast}
            />
          ) : activePage === 'settings' ? (
            <SettingsPage theme={theme} onThemeChange={setTheme} onReset={resetWorkspace} onToast={setToast} />
          ) : (
            <ModulePage
              page={activePage}
              state={appState}
              onNavigate={navigate}
              onAddTask={() => setModalMode('task')}
              onCapture={() => setModalMode('capture')}
              onToast={setToast}
              onPlanStudy={() => setStudyGoalOpen(true)}
              onStartStudy={(title, minutes, goalId) => startFocusSession(title, minutes, goalId)}
            />
          )}
        </main>
        <footer className="app-footer">
          <span>Silverstone is running locally in this browser.</span>
          <span><Icon name="shield" size={13} /> No connected accounts</span>
        </footer>
      </div>
      <button className="mobile-fab" onClick={() => setModalMode('task')}><Icon name="plus" size={17} /> New task</button>

      {modalMode && (
        <EntryDialog
          mode={modalMode}
          onClose={() => setModalMode(null)}
          onAddTask={addTask}
          onAddCapture={addCapture}
        />
      )}
      {searchOpen && (
        <SearchDialog
          tasks={appState.tasks}
          captures={appState.captures}
          onClose={() => setSearchOpen(false)}
          onNavigate={(page) => { navigate(page); setSearchOpen(false); }}
        />
      )}
      {focusOpen && <FocusDialog title={focusDetails.title} minutes={focusDetails.minutes} onComplete={completeFocusSession} onClose={() => setFocusOpen(false)} />}
      {studyGoalOpen && <StudyGoalDialog current={appState.studyGoal} onSave={saveStudyGoal} onClose={() => setStudyGoalOpen(false)} />}
      {voiceOpen && (
        <VoiceAssistantDialog
          tasks={appState.tasks}
          onAddTask={addTask}
          onAddCapture={addCapture}
          onStartFocus={() => { setVoiceOpen(false); startFocusSession(); }}
          onClose={() => setVoiceOpen(false)}
        />
      )}
      {toast && <div className="toast" role="status"><Icon name="check" size={16} />{toast}</div>}
    </div>
  );
}

interface SidebarProps {
  activePage: PageKey;
  open: boolean;
  onNavigate: (page: PageKey) => void;
  onClose: () => void;
}

function Sidebar({ activePage, open, onNavigate, onClose }: SidebarProps) {
  return (
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <div className="brand-row">
        <div className="brand-mark"><span /><span /><span /></div>
        <div className="brand-type"><strong>Silverstone</strong><small>PERSONAL AGENT</small></div>
        <button className="icon-button sidebar-close" aria-label="Close navigation" onClick={onClose}><Icon name="close" size={17} /></button>
      </div>

      <button className="workspace-switcher" onClick={() => onNavigate('today')}>
        <span className="workspace-avatar">P</span>
        <span className="workspace-copy"><strong>My workspace</strong><small>Personal</small></span>
        <Icon name="chevron" size={15} />
      </button>

      <nav className="sidebar-nav" aria-label="Main navigation">
        {navigation.map((group) => (
          <div className="nav-group" key={group.label}>
            <p className="nav-label">{group.label}</p>
            {group.items.map((item) => (
              <button
                key={item.key}
                className={`nav-item ${activePage === item.key ? 'nav-item-active' : ''}`}
                onClick={() => onNavigate(item.key)}
                aria-current={activePage === item.key ? 'page' : undefined}
              >
                <Icon name={item.icon} size={17} />
                <span>{item.label}</span>
                {item.key === 'observation' && <span className="nav-status" title="Observation is off" />}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <div className="week-card">
          <div className="week-card-top"><span className="week-icon"><Icon name="target" size={15} /></span><span className="week-kicker">THIS WEEK</span></div>
          <strong>One step at a time.</strong>
          <span className="week-progress-label">Your weekly rhythm <b>3 of 5</b></span>
          <div className="progress-track"><span style={{ width: '60%' }} /></div>
        </div>
        <button className={`nav-item ${activePage === 'settings' ? 'nav-item-active' : ''}`} onClick={() => onNavigate('settings')}>
          <Icon name="settings" size={17} /><span>Settings</span>
        </button>
        <button className="sidebar-profile" onClick={() => onNavigate('settings')}>
          <span className="profile-avatar">P</span>
          <span className="profile-copy"><strong>You</strong><small>Local preview</small></span>
          <Icon name="more" size={16} />
        </button>
      </div>
    </aside>
  );
}

interface TodayPageProps {
  tasks: AgentTask[];
  studyGoal: StudyGoal | null;
  openTasks: AgentTask[];
  completedTasks: number;
  onToggleTask: (id: string) => void;
  onStartFocus: () => void;
  onStartStudy: (title: string, minutes: number, goalId: string) => void;
  onAddTask: () => void;
  onCapture: () => void;
  onNavigate: (page: PageKey) => void;
  onToast: (message: string) => void;
}

function TodayPage({ tasks, studyGoal, openTasks, completedTasks, onToggleTask, onStartFocus, onStartStudy, onAddTask, onCapture, onNavigate, onToast }: TodayPageProps) {
  const [planExpanded, setPlanExpanded] = useState(false);
  const todayTasks = tasks.filter((task) => task.dueLabel !== 'Tomorrow');
  const doneToday = todayTasks.filter((task) => task.done).length;

  return (
    <>
      <div className="page-heading today-heading">
        <div>
          <div className="eyebrow-line"><span className="eyebrow-dot" /> {todayLabel()}</div>
          <h1>{greeting()}<span className="heading-period">.</span></h1>
          <p>Here’s a little more clarity for the day ahead.</p>
        </div>
        <div className="heading-actions">
          <button className="button button-secondary" onClick={onCapture}><Icon name="sparkle" size={16} /> Quick capture</button>
          <button className="button button-primary" onClick={onAddTask}><Icon name="plus" size={16} /> Add a task</button>
        </div>
      </div>

      <section className="hero-panel">
        <div className="hero-copy">
          <div className="hero-eyebrow"><span className="hero-live-dot" /> YOUR DAY, IN FOCUS</div>
          <h2>Small steps.<br /><em>Real momentum.</em></h2>
          <p>You have room for focused work and a little breathing space. Let’s make it count.</p>
          <div className="hero-actions">
            <button className="button button-light" onClick={onStartFocus}><Icon name="play" size={14} /> Start a focus session</button>
            <button className="hero-link" onClick={() => setPlanExpanded((value) => !value)}>
              {planExpanded ? 'Hide day plan' : 'Review my day'} <Icon name="arrow" size={15} />
            </button>
          </div>
          {planExpanded && <div className="plan-note"><Icon name="sparkle" size={14} /> You have 2 open blocks. A 25-minute study session fits before your next commitment.</div>}
        </div>
        <div className="hero-visual" aria-label="Daily goals are 60 percent complete">
          <div className="orbit-ring orbit-ring-one" />
          <div className="orbit-ring orbit-ring-two" />
          <div className="orbit-core">
            <span>DAILY INTENTION</span>
            <strong>3<span>/5</span></strong>
            <small>steps moving</small>
          </div>
          <span className="orbit-spark orbit-spark-one" />
          <span className="orbit-spark orbit-spark-two" />
          <span className="orbit-spark orbit-spark-three" />
        </div>
        <div className="hero-bottomline"><span><Icon name="shield" size={13} /> Your plan stays flexible</span><span>LOCAL PREVIEW DATA</span></div>
      </section>

      <section className="metric-grid" aria-label="Daily overview">
        <MetricCard icon="clock" label="FOCUS TIME" value="2h 15m" note="of your 3h goal" noteTone="blue" chart={[34, 60, 42, 75, 49, 82, 62]} />
        <MetricCard icon="check" label="TASKS MOVING" value={`${doneToday} / ${Math.max(todayTasks.length, 3)}`} note="One clear next step" noteTone="green" progress={todayTasks.length ? (doneToday / todayTasks.length) * 100 : 0} />
        <MetricCard icon="calendar" label="UP NEXT" value="10:30" note="Study · 25 minutes" noteTone="violet" />
        <MetricCard icon="sparkles" label="OPEN SPACE" value="1h 40m" note="Across 2 open blocks" noteTone="amber" />
      </section>

      <div className="dashboard-grid dashboard-grid-main">
        <section className="panel next-panel">
          <PanelHeading eyebrow="A GOOD PLACE TO START" title="Your next moves" action="View all" onAction={() => onNavigate('study')} />
          <div className="next-move-list">
            <NextMove icon="book" tone="blue" tag="STUDY" title={studyGoal ? (recommendedStudyBlock(studyGoal) ? `Continue ${studyGoal.topic}` : `Check in for ${studyGoal.topic}`) : 'Set your first study goal'} subtitle={studyGoal ? (recommendedStudyBlock(studyGoal) ? 'Your local study plan · one gentle block' : 'Update your free time to choose a short block') : 'Choose a topic and tell Silverstone your free time'} meta={studyGoal ? (recommendedStudyBlock(studyGoal) ? `${recommendedStudyBlock(studyGoal)} min` : 'Check in') : 'Plan'} onClick={studyGoal ? () => { const block = recommendedStudyBlock(studyGoal); if (block) onStartStudy(studyGoal.topic, block, studyGoal.id); else onNavigate('study'); } : () => onNavigate('study')} />
            <NextMove icon="briefcase" tone="violet" tag="CAREER" title="Your fellowship essay is ready for one more pass" subtitle="Atlas Future Leaders · Due Nov 14" meta="12 min" onClick={() => onNavigate('career')} />
            <NextMove icon="layers" tone="green" tag="PORTFOLIO" title="Add the outcome to your project story" subtitle="Case study · 2 notes to review" meta="15 min" onClick={() => onNavigate('portfolio')} />
          </div>
          <button className="panel-foot-link" onClick={() => onToast('Suggestions are based on this local preview plan')}>
            <span><Icon name="sparkle" size={14} /> Why these suggestions?</span><Icon name="arrow" size={14} />
          </button>
        </section>

        <section className="panel agenda-panel">
          <PanelHeading eyebrow="A FLEXIBLE OUTLINE" title="Today’s rhythm" action="Open calendar" onAction={() => onToast('Calendar connection is not set up yet')} />
          <div className="agenda-timeline">
            <AgendaRow time="09:00" title="Deep work" detail="Portfolio case study" tone="blue" state="done" />
            <AgendaRow time="10:30" title="Study session" detail="Rust · ownership" tone="violet" state="next" />
            <AgendaRow time="12:00" title="Open space" detail="Lunch or a short walk" tone="soft" state="open" />
            <AgendaRow time="14:00" title="Application review" detail="Fellowship essay" tone="amber" state="upcoming" />
          </div>
          <div className="agenda-note"><Icon name="sparkle" size={14} /> Your open time is yours to adjust.</div>
        </section>
      </div>

      <div className="dashboard-grid dashboard-grid-lower">
        <section className="panel focus-panel">
          <PanelHeading eyebrow="A STEADY RHYTHM" title="Your focus this week" action="Study space" onAction={() => onNavigate('study')} />
          <div className="focus-chart-wrap">
            <div className="chart-y-labels"><span>3h</span><span>2h</span><span>1h</span><span>0</span></div>
            <div className="focus-chart" role="img" aria-label="Focus time for the last seven days: 1.4, 2.2, 1.8, 2.7, 2.1, 3.0 and 2.4 hours">
              <div className="chart-grid-lines"><span /><span /><span /><span /></div>
              <svg viewBox="0 0 520 140" preserveAspectRatio="none" className="focus-svg" aria-hidden="true">
                <defs><linearGradient id="focus-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6e78f8" stopOpacity=".23" /><stop offset="100%" stopColor="#6e78f8" stopOpacity="0" /></linearGradient></defs>
                <path d="M0 92 C34 88 48 82 78 81 S130 52 160 57 S218 76 240 68 S296 35 320 42 S370 64 400 54 S452 22 480 31 S505 41 520 35 L520 140 L0 140Z" fill="url(#focus-fill)" />
                <path d="M0 92 C34 88 48 82 78 81 S130 52 160 57 S218 76 240 68 S296 35 320 42 S370 64 400 54 S452 22 480 31 S505 41 520 35" fill="none" stroke="#7279ef" strokeWidth="3" strokeLinecap="round" />
                <circle cx="320" cy="42" r="4.5" fill="#fff" stroke="#7279ef" strokeWidth="3" />
                <circle cx="480" cy="31" r="4.5" fill="#fff" stroke="#7279ef" strokeWidth="3" />
              </svg>
              <div className="chart-x-labels"><span>MON</span><span>TUE</span><span>WED</span><span>THU</span><span>FRI</span><span>SAT</span><span>SUN</span></div>
            </div>
          </div>
          <div className="focus-summary"><span className="focus-summary-dot" /> A little more consistent than last week <strong>+18%</strong></div>
        </section>

        <section className="panel tasks-panel">
          <PanelHeading eyebrow="KEEP IT LIGHT" title="Your priorities" action="All tasks" onAction={() => onNavigate('today')} />
          <div className="task-list">
            {openTasks.slice(0, 3).map((task) => <TaskRow key={task.id} task={task} onToggle={() => onToggleTask(task.id)} />)}
            {openTasks.length === 0 && <div className="empty-state compact"><span className="empty-icon"><Icon name="check" /></span><strong>Clear space, clear mind.</strong><span>You’ve moved every task forward.</span></div>}
          </div>
          <button className="add-task-inline" onClick={onAddTask}><Icon name="plus" size={15} /> Add a priority</button>
          <div className="task-count-note">{completedTasks} complete · {openTasks.length} still open</div>
        </section>
      </div>

      <div className="dashboard-grid dashboard-grid-bottom">
        <section className="panel application-panel">
          <PanelHeading eyebrow="CAREER MOMENTUM" title="Opportunities in motion" action="Career space" onAction={() => onNavigate('career')} />
          <div className="opportunity-summary"><strong>3</strong><span>active applications</span><div className="pipeline-avatars"><i>A</i><i>N</i><i>O</i></div></div>
          <div className="pipeline-track"><span className="pipeline-done" /><span className="pipeline-progress" /><span /><span /></div>
          <div className="pipeline-labels"><span>Exploring</span><span>Preparing</span><span>Submitted</span><span>In review</span></div>
          <div className="next-deadline"><span className="deadline-icon"><Icon name="calendar" size={15} /></span><span><small>NEXT DEADLINE</small><strong>Atlas Future Leaders · Nov 14</strong></span><Icon name="arrow" size={15} /></div>
        </section>

        <section className="observation-card">
          <div className="observation-top"><span className="observation-icon"><Icon name="scan" size={17} /></span><span className="status-pill status-off"><span /> OFF</span></div>
          <p className="eyebrow">YOUR CONTEXT, YOUR CHOICE</p>
          <h3>Observation is<br />paused.</h3>
          <p className="observation-description">No accounts or device sensors are connected in this local preview.</p>
          <button className="observation-link" onClick={() => onNavigate('observation')}>Explore permissions <Icon name="arrow" size={15} /></button>
          <div className="observation-grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
        </section>
      </div>
      <div className="dashboard-endnote"><Icon name="shield" size={14} /> Your workspace is stored on this device. Connected services are not enabled.</div>
    </>
  );
}

function MetricCard({ icon, label, value, note, noteTone, chart, progress }: { icon: IconName; label: string; value: string; note: string; noteTone: string; chart?: number[]; progress?: number }) {
  return (
    <div className="metric-card">
      <div className="metric-top"><span className={`metric-icon metric-${noteTone}`}><Icon name={icon} size={16} /></span><span className="metric-label">{label}</span><button className="metric-more" aria-label={`More about ${label}`}><Icon name="more" size={16} /></button></div>
      <div className="metric-value">{value}</div>
      <div className="metric-foot"><span className={`metric-note note-${noteTone}`}><i />{note}</span>
        {chart && <div className="mini-bars" aria-hidden="true">{chart.map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div>}
        {progress !== undefined && <div className="metric-progress"><span style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} /></div>}
      </div>
    </div>
  );
}

function PanelHeading({ eyebrow, title, action, onAction }: { eyebrow: string; title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="panel-heading">
      <div><span className="panel-eyebrow">{eyebrow}</span><h3>{title}</h3></div>
      {action && <button className="text-action" onClick={onAction}>{action}<Icon name="arrow" size={14} /></button>}
    </div>
  );
}

function NextMove({ icon, tone, tag, title, subtitle, meta, onClick }: { icon: IconName; tone: string; tag: string; title: string; subtitle: string; meta: string; onClick: () => void }) {
  return (
    <button className="next-move" onClick={onClick}>
      <span className={`move-icon move-${tone}`}><Icon name={icon} size={17} /></span>
      <span className="move-copy"><small>{tag}</small><strong>{title}</strong><span>{subtitle}</span></span>
      <span className="move-meta"><span>{meta}</span><Icon name="arrow" size={14} /></span>
    </button>
  );
}

function AgendaRow({ time, title, detail, tone, state }: { time: string; title: string; detail: string; tone: string; state: 'done' | 'next' | 'open' | 'upcoming' }) {
  return (
    <div className={`agenda-row agenda-${state}`}>
      <span className="agenda-time">{time}</span>
      <span className={`agenda-marker marker-${tone}`}>{state === 'done' ? <Icon name="check" size={11} /> : null}</span>
      <span className="agenda-event"><strong>{title}</strong><small>{detail}</small></span>
      {state === 'next' && <span className="agenda-next-label">NEXT</span>}
    </div>
  );
}

function TaskRow({ task, onToggle }: { task: AgentTask; onToggle: () => void }) {
  return (
    <div className={`task-row ${task.done ? 'task-done' : ''}`}>
      <button className="task-checkbox" onClick={onToggle} aria-label={task.done ? `Mark ${task.title} incomplete` : `Complete ${task.title}`}>
        {task.done && <Icon name="check" size={13} />}
      </button>
      <span className={`task-category-dot category-${task.category.toLowerCase()}`} />
      <span className="task-title">{task.title}</span>
      <span className="task-due">{task.dueLabel}</span>
    </div>
  );
}

function ModulePage({ page, state, onNavigate, onAddTask, onCapture, onToast, onPlanStudy, onStartStudy }: {
  page: Exclude<PageKey, 'today' | 'settings'>;
  state: LocalAppState;
  onNavigate: (page: PageKey) => void;
  onAddTask: () => void;
  onCapture: () => void;
  onToast: (message: string) => void;
  onPlanStudy: () => void;
  onStartStudy: (topic: string, minutes: number, goalId: string) => void;
}) {
  const copy = pageCopy[page];
  return (
    <>
      <div className="page-heading module-heading">
        <div><div className="eyebrow-line"><span className="eyebrow-dot" /> {copy.eyebrow}</div><h1>{copy.title}</h1><p>{copy.subtitle}</p></div>
        <div className="heading-actions">
          <button className="button button-secondary" onClick={onCapture}><Icon name="sparkle" size={16} /> Capture</button>
          <button className="button button-primary" onClick={page === 'library' ? onCapture : onAddTask}><Icon name="plus" size={16} /> {page === 'library' ? 'Add a note' : 'Add a task'}</button>
        </div>
      </div>
      {page === 'study' && <StudyModule goal={state.studyGoal} sessions={state.studySessions} onPlan={onPlanStudy} onStart={onStartStudy} />}
      {page === 'career' && <CareerModule onToast={onToast} />}
      {page === 'portfolio' && <PortfolioModule onToast={onToast} />}
      {page === 'studio' && <StudioModule onToast={onToast} />}
      {page === 'library' && <LibraryModule captures={state.captures} onCapture={onCapture} />}
      {page === 'observation' && <ObservationModule onToast={onToast} />}
      {page === 'activity' && <ActivityModule state={state} />}
      <div className="module-footer-link"><button className="text-action" onClick={() => onNavigate('today')}>Back to Today <Icon name="arrow" size={14} /></button></div>
    </>
  );
}

function StudyModule({ goal, sessions, onPlan, onStart }: {
  goal: StudyGoal | null;
  sessions: StudySession[];
  onPlan: () => void;
  onStart: (topic: string, minutes: number, goalId: string) => void;
}) {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const completedMinutes = sessions
    .filter((session) => goal && session.goalId === goal.id && new Date(session.completedAt).getTime() >= weekAgo)
    .reduce((total, session) => total + session.plannedMinutes, 0);
  const targetMinutes = goal?.weeklyTargetMinutes ?? 0;
  const progress = targetMinutes ? Math.min(100, Math.round((completedMinutes / targetMinutes) * 100)) : 0;
  const recommendedMinutes = recommendedStudyBlock(goal);
  const checkedInToday = goal?.availabilityDate === localDateKey();

  return (
    <div className="module-layout">
      <section className="module-hero study-module-hero">
        <div><span className="panel-eyebrow">YOUR STUDY PLAN</span><h2>{goal ? <>Make progress on<br />{goal.topic}.</> : <>Build understanding<br />one session at a time.</>}</h2><p>{goal ? `${Math.round(goal.weeklyTargetMinutes / 60 * 10) / 10} hours this week · ${checkedInToday ? `${goal.availableMinutesToday} minutes available today` : 'check in with today’s free time'}.` : 'Choose a topic, set a weekly target, and tell Silverstone how much time you have today.'}</p><div className="study-actions"><button className="button button-primary" onClick={onPlan}><Icon name="target" size={14} /> {goal ? (checkedInToday ? 'Adjust my goal' : 'Check in for today') : 'Set a study goal'}</button>{goal && recommendedMinutes > 0 && <button className="button button-secondary" onClick={() => onStart(goal.topic, recommendedMinutes, goal.id)}><Icon name="play" size={14} /> Start {recommendedMinutes} minutes</button>}</div></div>
        <div className="study-score"><span>LAST 7 DAYS</span><strong>{progress}<small>%</small></strong><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><small>{goal ? `${completedMinutes}m of ${targetMinutes}m` : 'Set a goal to track progress'}</small></div>
      </section>
      <section className="panel module-panel"><PanelHeading eyebrow="READY TO REVIEW" title="Your learning queue" action={goal ? 'Edit study plan' : 'Set study goal'} onAction={onPlan} /><div className="learning-list">{goal ? <LearningRow icon="book" title={goal.topic} detail={`${completedMinutes} minutes logged in the last 7 days`} percent={progress ? `${progress}%` : 'Ready'} tone="blue" /> : <div className="study-empty"><span className="empty-icon"><Icon name="book" /></span><strong>Your study plan starts with a goal.</strong><span>Pick one topic and a weekly time target. You can change it whenever life changes.</span></div>}</div></section>
      <section className="module-cards"><MiniInfoCard icon="clock" title="Today’s availability" body={goal ? (checkedInToday ? `${goal.availableMinutesToday} minutes available today. Your plan suggests a ${recommendedMinutes || 'rest'} session.` : 'Your last availability check is from another day. Update it when you know what time you have today.') : 'Tell Silverstone how much time you have today, and it will suggest a small session.'} /><MiniInfoCard icon="sparkle" title="A helpful next step" body="Use a short recall session, then note what still feels unclear." /></section>
    </div>
  );
}

function LearningRow({ icon, title, detail, percent, tone }: { icon: IconName; title: string; detail: string; percent: string; tone: string }) {
  return <div className="learning-row"><span className={`move-icon move-${tone}`}><Icon name={icon} size={17} /></span><span className="learning-copy"><strong>{title}</strong><small>{detail}</small></span><span className={`learning-status status-${tone}`}>{percent}</span><Icon name="chevron" size={15} />
  </div>;
}

function CareerModule({ onToast }: { onToast: (message: string) => void }) {
  return (
    <div className="module-layout">
      <section className="module-stats"><MiniStat value="3" label="Active applications" icon="briefcase" /><MiniStat value="2" label="Deadlines this month" icon="calendar" /><MiniStat value="1" label="Needs your review" icon="shield" /></section>
      <section className="panel module-panel"><PanelHeading eyebrow="YOUR PIPELINE" title="Opportunities in motion" action="Add opportunity" onAction={() => onToast('Opportunity intake is coming next')} /><div className="opportunity-list">{opportunityRows.map((item) => <div className="opportunity-row" key={item.name}><span className={`opportunity-badge badge-${item.tone}`}><Icon name="briefcase" size={16} /></span><span className="opportunity-copy"><strong>{item.name}</strong><small>{item.type}</small></span><span className="stage-pill">{item.stage}</span><span className="opportunity-due"><small>DUE</small><strong>{item.due}</strong></span><button className="icon-button row-chevron" aria-label={`Open ${item.name}`} onClick={() => onToast(`${item.name} details are part of the next milestone`)}><Icon name="arrow" size={15} /></button></div>)}</div></section>
      <section className="module-cards"><MiniInfoCard icon="file" title="Evidence library" body="Keep your experience and achievements linked to the source that supports them." /><MiniInfoCard icon="sparkle" title="Draft with confidence" body="CV and essay drafts will flag claims that need your confirmation." /></section>
    </div>
  );
}

function PortfolioModule({ onToast }: { onToast: (message: string) => void }) {
  return (
    <div className="module-layout">
      <section className="portfolio-banner"><div><span className="panel-eyebrow">A PORTFOLIO THAT GROWS WITH YOU</span><h2>Turn the process<br />into the story.</h2><p>Bring evidence, decisions, and outcomes together before you publish.</p><button className="button button-light" onClick={() => onToast('Portfolio editing is planned; nothing has been published')}>Create a project</button></div><div className="portfolio-art"><span className="portfolio-art-card art-back" /><span className="portfolio-art-card art-mid" /><span className="portfolio-art-card art-front"><Icon name="layers" size={22} /><small>PROJECT / 01</small><b>Field notes<br />for better work.</b></span><span className="portfolio-orb" /></div></section>
      <section className="module-cards portfolio-projects"><ProjectCard initials="01" name="A clearer onboarding flow" type="Product design · Case study" status="DRAFT" tone="blue" onClick={() => onToast('Project workspace is not connected yet')} /><ProjectCard initials="02" name="Community learning map" type="Research · Prototype" status="IN PROGRESS" tone="violet" onClick={() => onToast('Project workspace is not connected yet')} /></section>
      <section className="module-note"><Icon name="shield" size={16} /><span>Portfolio changes will be previewed and reviewed before anything is published.</span></section>
    </div>
  );
}

function ProjectCard({ initials, name, type, status, tone, onClick }: { initials: string; name: string; type: string; status: string; tone: string; onClick: () => void }) {
  return <button className="project-card" onClick={onClick}><span className={`project-art project-art-${tone}`}><b>{initials}</b><i /><i /><i /></span><span className="project-card-body"><small>{status}</small><strong>{name}</strong><span>{type}</span><span className="project-open">Open project <Icon name="arrow" size={14} /></span></span></button>;
}

function StudioModule({ onToast }: { onToast: (message: string) => void }) {
  return (
    <div className="module-layout">
      <section className="module-hero studio-module-hero"><div><span className="panel-eyebrow">CREATOR STUDIO</span><h2>One idea.<br />Thoughtfully adapted.</h2><p>Draft once, tailor each version, and review every channel before it goes live.</p><button className="button button-primary" onClick={() => onToast('A local draft editor is coming next') }><Icon name="plus" size={15} /> Start a draft</button></div><div className="studio-orbit"><div className="studio-orbit-core"><Icon name="sparkles" size={24} /></div><span className="studio-node node-one">in</span><span className="studio-node node-two">x</span><span className="studio-node node-three">ig</span><span className="studio-node node-four">f</span></div></section>
      <section className="panel module-panel"><PanelHeading eyebrow="LOCAL DRAFT CALENDAR" title="Ideas taking shape" action="Full calendar" onAction={() => onToast('No posts are scheduled; social accounts are not connected')} /><div className="draft-list"><DraftRow date="NOV 08" channel="LinkedIn · Personal story" title="What I learned from simplifying the first-run experience" tone="blue" /><DraftRow date="NOV 12" channel="X · Short reflection" title="A small principle about making complex tools feel calm" tone="violet" /><DraftRow date="NOV 16" channel="Instagram · Project reveal" title="A visual walkthrough of the community learning map" tone="amber" /></div></section>
      <section className="module-note"><Icon name="shield" size={16} /><span>Publishing is disabled until an account is connected and each post is approved.</span></section>
    </div>
  );
}

function DraftRow({ date, channel, title, tone }: { date: string; channel: string; title: string; tone: string }) {
  return <div className="draft-row"><span className={`draft-date draft-${tone}`}>{date}</span><span className="draft-copy"><small>{channel}</small><strong>{title}</strong></span><span className="draft-status"><i /> Idea</span><Icon name="chevron" size={15} />
  </div>;
}

function LibraryModule({ captures, onCapture }: { captures: CaptureItem[]; onCapture: () => void }) {
  return (
    <div className="module-layout">
      <section className="library-banner"><span className="library-banner-icon"><Icon name="library" size={22} /></span><div><span className="panel-eyebrow">PERSONAL KNOWLEDGE, KEPT CLEAR</span><h2>Capture now.<br />Make sense later.</h2><p>Your notes are stored locally in this browser preview.</p></div><button className="button button-primary" onClick={onCapture}><Icon name="plus" size={15} /> New capture</button></section>
      <section className="panel module-panel"><PanelHeading eyebrow="RECENTLY CAPTURED" title="Your library" action={captures.length ? `${captures.length} item${captures.length === 1 ? '' : 's'}` : 'No items yet'} />
        {captures.length > 0 ? <div className="capture-list">{captures.map((capture) => <div className="capture-row" key={capture.id}><span className="capture-icon"><Icon name="file" size={16} /></span><span><strong>{capture.text}</strong><small>{capture.kind} · {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(capture.createdAt))}</small></span><span className="capture-local"><Icon name="shield" size={13} /> Local</span></div>)}</div> : <div className="empty-state"><span className="empty-icon"><Icon name="sparkle" /></span><strong>A fresh page, ready for a thought.</strong><span>Save an idea, useful link, or note. Nothing is connected to a cloud account yet.</span><button className="button button-secondary" onClick={onCapture}><Icon name="plus" size={15} /> Add your first note</button></div>}
      </section>
    </div>
  );
}

function ObservationModule({ onToast }: { onToast: (message: string) => void }) {
  return (
    <div className="module-layout">
      <section className="observation-hero"><div className="observation-hero-mark"><Icon name="scan" size={22} /></div><span className="panel-eyebrow">CURRENT STATE</span><h2>Nothing is being observed.</h2><p>This preview has no connected accounts or active sensors. Each source will have its own access level and a clear pause control.</p><div className="observation-session-status"><span className="status-pill status-off"><span /> ALL SOURCES OFF</span><span className="small-separator" /><span>Last activity: none</span></div></section>
      <section className="panel module-panel permission-panel"><PanelHeading eyebrow="PERMISSION CENTER" title="Sources you can choose" /><div className="permission-list">
        <PermissionRow icon="file" title="Files and folders" detail="Only folders you explicitly select" mode="OFF" />
        <PermissionRow icon="bell" title="Notifications and app context" detail="Per-app access where your device allows it" mode="OFF" />
        <PermissionRow icon="camera" title="Live visual context" detail="Foreground camera session · no-save option" mode="OFF" />
        <PermissionRow icon="send" title="Messages and social" detail="Coverage depends on official provider APIs" mode="OFF" />
        <PermissionRow icon="trend" title="Finance and brokerage" detail="Read-only summaries in the planned release" mode="OFF" />
      </div></section>
      <section className="module-cards"><MiniInfoCard icon="shield" title="Read access is separate from action access" body="Seeing a source never gives the agent permission to send, publish, or change it." /><MiniInfoCard icon="clock" title="Pause whenever you want" body="The finished app will have per-source pause and a pause-all control." /></section>
      <div className="module-note"><Icon name="sparkle" size={16} /><span>Connector setup is not implemented in this first shell. These rows show the planned permission model.</span><button onClick={() => onToast('No source connections are available in this preview')}>Got it</button></div>
    </div>
  );
}

function PermissionRow({ icon, title, detail, mode }: { icon: IconName; title: string; detail: string; mode: string }) {
  return <div className="permission-row"><span className="permission-icon"><Icon name={icon} size={17} /></span><span className="permission-copy"><strong>{title}</strong><small>{detail}</small></span><span className="permission-mode">{mode}</span><span className="permission-chevron"><Icon name="chevron" size={15} /></span></div>;
}

function ActivityModule({ state }: { state: LocalAppState }) {
  const localEvents = state.captures.slice(0, 3).map((capture) => ({
    time: new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(capture.createdAt)),
    title: 'Note captured',
    detail: `${capture.text} · local`,
    tone: 'green',
  }));
  return (
    <div className="module-layout activity-layout">
      <section className="module-stats"><MiniStat value={`${state.tasks.length}`} label="Tasks in this browser" icon="check" /><MiniStat value={`${state.captures.length}`} label="Local captures" icon="file" /><MiniStat value="0" label="Connected services" icon="shield" /></section>
      <section className="panel module-panel"><PanelHeading eyebrow="LOCAL PREVIEW HISTORY" title="Recent activity" action="All activity" />
        <div className="activity-timeline">{[...localEvents, ...demoEvents].map((event, index) => <div className="activity-row" key={`${event.title}-${index}`}><span className="activity-time">{event.time}</span><span className={`activity-marker activity-${event.tone}`}><i /></span><span className="activity-copy"><strong>{event.title}</strong><small>{event.detail}</small></span></div>)}</div>
      </section>
      <div className="module-note"><Icon name="shield" size={16} /><span>External actions are not available in the local preview, so this timeline contains only local activity.</span></div>
    </div>
  );
}

function SettingsPage({ theme, onThemeChange, onReset, onToast }: { theme: Theme; onThemeChange: (theme: Theme) => void; onReset: () => void; onToast: (message: string) => void }) {
  return (
    <>
      <div className="page-heading module-heading"><div><div className="eyebrow-line"><span className="eyebrow-dot" /> YOUR CONTROLS</div><h1>Make this space yours.</h1><p>Preferences and privacy controls for this device.</p></div></div>
      <div className="settings-layout">
        <section className="panel settings-panel"><PanelHeading eyebrow="APPEARANCE" title="A comfortable workspace" /><div className="setting-row"><span className="setting-symbol"><Icon name={theme === 'light' ? 'sun' : 'moon'} size={18} /></span><span className="setting-copy"><strong>Color theme</strong><small>Choose the look that works for you.</small></span><div className="segmented-control"><button className={theme === 'light' ? 'selected' : ''} onClick={() => onThemeChange('light')}><Icon name="sun" size={14} /> Light</button><button className={theme === 'dark' ? 'selected' : ''} onClick={() => onThemeChange('dark')}><Icon name="moon" size={14} /> Dark</button></div></div></section>
        <section className="panel settings-panel"><PanelHeading eyebrow="LOCAL DATA" title="This browser only" /><div className="local-data-card"><span className="local-data-icon"><Icon name="shield" size={18} /></span><span><strong>Your current preview data stays on this device.</strong><small>Tasks, captures, study goals, and theme preferences use browser storage, which is not an encrypted vault. Keep sensitive documents and account details out of this preview.</small></span></div><div className="setting-row setting-row-danger"><span className="setting-symbol danger-symbol"><Icon name="reset" size={18} /></span><span className="setting-copy"><strong>Clear local workspace</strong><small>Remove tasks, captures, and study progress from this browser.</small></span><button className="button button-danger" onClick={() => { if (window.confirm('Clear all tasks, captures, and study progress stored in this browser?')) onReset(); }}>Clear data</button></div></section>
        <section className="panel settings-panel"><PanelHeading eyebrow="CONNECTIONS" title="No services connected" /><div className="empty-connection"><span className="connection-lock"><Icon name="shield" size={19} /></span><p>Mail, calendar, social, brokerage, and device access are not active in this shell.</p><button className="text-action" onClick={() => onToast('Connection setup will be added after the permission service')}>Connection roadmap <Icon name="arrow" size={14} /></button></div></section>
      </div>
    </>
  );
}

function MiniStat({ value, label, icon }: { value: string; label: string; icon: IconName }) {
  return <div className="mini-stat"><span className="mini-stat-icon"><Icon name={icon} size={16} /></span><strong>{value}</strong><small>{label}</small></div>;
}

function MiniInfoCard({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return <article className="mini-info-card"><span className="mini-info-icon"><Icon name={icon} size={17} /></span><div><strong>{title}</strong><p>{body}</p></div></article>;
}

function EntryDialog({ mode, onClose, onAddTask, onAddCapture }: { mode: Exclude<ModalMode, null>; onClose: () => void; onAddTask: (title: string, category: TaskCategory) => void; onAddCapture: (text: string) => void }) {
  const [text, setText] = useState('');
  const [category, setCategory] = useState<TaskCategory>('Personal');
  const isTask = mode === 'task';

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    if (isTask) onAddTask(value, category);
    else onAddCapture(value);
  }

  return (
    <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="entry-dialog-title">
        <div className="dialog-top"><span className="dialog-icon"><Icon name={isTask ? 'check' : 'sparkle'} size={18} /></span><button className="icon-button" aria-label="Close dialog" onClick={onClose}><Icon name="close" size={17} /></button></div>
        <span className="panel-eyebrow">{isTask ? 'A CLEAR NEXT STEP' : 'QUICK CAPTURE'}</span>
        <h2 id="entry-dialog-title">{isTask ? 'Add a task.' : 'Save a thought.'}</h2>
        <p>{isTask ? 'Keep it small and specific. You can shape the plan later.' : 'A note will be saved locally in this browser.'}</p>
        <form onSubmit={submit}>
          <label className="field-label" htmlFor="entry-text">{isTask ? 'What needs doing?' : 'What would you like to remember?'}</label>
          <textarea id="entry-text" autoFocus rows={3} maxLength={500} value={text} onChange={(event) => setText(event.target.value)} placeholder={isTask ? 'e.g. Review the scholarship essay' : 'Write a note, idea, or reminder…'} />
          {isTask && <><label className="field-label" htmlFor="entry-category">Workspace</label><select id="entry-category" value={category} onChange={(event) => setCategory(event.target.value as TaskCategory)}><option>Personal</option><option>Study</option><option>Career</option><option>Portfolio</option></select></>}
          <div className="dialog-foot"><span><Icon name="shield" size={13} /> Saved on this device</span><button className="button button-primary" type="submit" disabled={!text.trim()}>{isTask ? 'Add task' : 'Save note'}<Icon name="arrow" size={14} /></button></div>
        </form>
      </section>
    </div>
  );
}

function StudyGoalDialog({ current, onSave, onClose }: { current: StudyGoal | null; onSave: (goal: StudyGoal) => void; onClose: () => void }) {
  const [topic, setTopic] = useState(current?.topic ?? '');
  const [weeklyHours, setWeeklyHours] = useState(String(current ? current.weeklyTargetMinutes / 60 : 3));
  const [availableMinutes, setAvailableMinutes] = useState(current?.availabilityDate === localDateKey() ? current.availableMinutesToday : 30);
  const weeklyMinutes = Math.round(Number(weeklyHours) * 60);
  const recommendedMinutes = availableMinutes > 0
    ? Math.min(25, availableMinutes, Math.max(5, Math.ceil(weeklyMinutes / 5)))
    : 0;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTopic = topic.trim();
    if (!cleanTopic || !Number.isFinite(weeklyMinutes) || weeklyMinutes < 60 || weeklyMinutes > 1800) return;
    onSave({
      id: current?.id ?? createId('study-goal'),
      topic: cleanTopic,
      weeklyTargetMinutes: weeklyMinutes,
      availableMinutesToday: availableMinutes,
      availabilityDate: localDateKey(),
      updatedAt: new Date().toISOString(),
    });
  }

  return (
    <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dialog-card study-goal-dialog" role="dialog" aria-modal="true" aria-labelledby="study-goal-title">
        <div className="dialog-top"><span className="dialog-icon"><Icon name="target" size={18} /></span><button className="icon-button" aria-label="Close study goal" onClick={onClose}><Icon name="close" size={17} /></button></div>
        <span className="panel-eyebrow">A GOAL THAT FITS YOUR WEEK</span>
        <h2 id="study-goal-title">What would you like to learn?</h2>
        <p>Start with one topic. You can adjust the goal whenever your schedule changes.</p>
        <form onSubmit={submit}>
          <label className="field-label" htmlFor="study-topic">Study topic</label>
          <input id="study-topic" required maxLength={100} value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="e.g. Rust ownership and borrowing" />
          <div className="study-goal-fields">
            <div><label className="field-label" htmlFor="study-weekly-hours">Weekly target</label><div className="study-number-field"><input id="study-weekly-hours" type="number" min="1" max="30" step="0.5" required value={weeklyHours} onChange={(event) => setWeeklyHours(event.target.value)} /><span>hours</span></div></div>
            <div><label className="field-label" htmlFor="study-free-time">Free time today</label><select id="study-free-time" value={availableMinutes} onChange={(event) => setAvailableMinutes(Number(event.target.value))}><option value={0}>No time today</option><option value={10}>10 minutes</option><option value={15}>15 minutes</option><option value={20}>20 minutes</option><option value={25}>25 minutes</option><option value={30}>30 minutes</option><option value={45}>45 minutes</option><option value={60}>1 hour</option><option value={90}>1½ hours</option><option value={120}>2 hours</option></select></div>
          </div>
          <div className="study-plan-preview"><span className="study-plan-icon"><Icon name="sparkle" size={16} /></span><div><strong>{recommendedMinutes ? `A ${recommendedMinutes}-minute session fits today.` : 'No study session planned for today.'}</strong><small>{recommendedMinutes ? `That is a gentle first step toward your ${weeklyHours || 'weekly'}-hour goal.` : 'Your weekly goal stays saved. You can plan a session when you have time.'}</small></div></div>
          <div className="dialog-foot"><span><Icon name="shield" size={13} /> Stored locally on this device</span><div className="study-goal-actions"><button className="button button-secondary" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={!topic.trim() || !Number.isFinite(weeklyMinutes) || weeklyMinutes < 60 || weeklyMinutes > 1800}>Save my goal<Icon name="arrow" size={14} /></button></div></div>
        </form>
      </section>
    </div>
  );
}

function SearchDialog({ tasks, captures, onClose, onNavigate }: { tasks: AgentTask[]; captures: CaptureItem[]; onClose: () => void; onNavigate: (page: PageKey) => void }) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    const taskResults = tasks.filter((task) => task.title.toLowerCase().includes(normalized)).map((task) => ({ id: task.id, title: task.title, detail: `${task.category} task`, page: 'today' as PageKey }));
    const captureResults = captures.filter((capture) => capture.text.toLowerCase().includes(normalized)).map((capture) => ({ id: capture.id, title: capture.text, detail: 'Local note', page: 'library' as PageKey }));
    return [...taskResults, ...captureResults].slice(0, 6);
  }, [captures, query, tasks]);

  return (
    <div className="modal-scrim search-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="search-dialog" role="dialog" aria-modal="true" aria-label="Search local workspace">
        <div className="search-dialog-input"><Icon name="search" size={18} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks and notes…" /><kbd>ESC</kbd><button className="icon-button" aria-label="Close search" onClick={onClose}><Icon name="close" size={16} /></button></div>
        {query.trim() ? <div className="search-results">{results.length ? results.map((result) => <button key={result.id} className="search-result" onClick={() => onNavigate(result.page)}><span className="search-result-icon"><Icon name={result.detail.includes('task') ? 'check' : 'file'} size={15} /></span><span><strong>{result.title}</strong><small>{result.detail}</small></span><Icon name="arrow" size={14} /></button>) : <div className="search-empty">No local results for “{query}”.</div>}</div> : <div className="search-hint"><span>Search stays within your local preview data.</span><span><kbd>↵</kbd> to open a result</span></div>}
      </section>
    </div>
  );
}

function FocusDialog({ title, minutes: sessionMinutes, onComplete, onClose }: { title: string; minutes: number; onComplete: () => void; onClose: () => void }) {
  const durationSeconds = Math.max(1, Math.round(sessionMinutes * 60));
  const [seconds, setSeconds] = useState(durationSeconds);
  const [running, setRunning] = useState(true);
  const completionHandled = useRef(false);
  useEffect(() => {
    if (!running || seconds <= 0) return undefined;
    const timer = window.setInterval(() => setSeconds((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [running, seconds]);
  useEffect(() => {
    if (seconds !== 0 || completionHandled.current) return;
    completionHandled.current = true;
    onComplete();
  }, [onComplete, seconds]);
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = (seconds % 60).toString().padStart(2, '0');
  const progress = (durationSeconds - seconds) / durationSeconds;
  const circumference = 2 * Math.PI * 79;

  return (
    <div className="modal-scrim focus-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="focus-dialog" role="dialog" aria-modal="true" aria-labelledby="focus-title">
        <button className="icon-button focus-close" aria-label="Close focus session" onClick={onClose}><Icon name="close" size={18} /></button>
        <span className="panel-eyebrow">A LITTLE SPACE TO FOCUS</span><h2 id="focus-title">One thing at a time.</h2><p>{title} · {sessionMinutes} minute session</p>
        <div className="timer-ring"><svg viewBox="0 0 190 190" aria-hidden="true"><circle cx="95" cy="95" r="79" className="timer-track" /><circle cx="95" cy="95" r="79" className="timer-progress" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} /></svg><strong aria-live="polite">{minutes}:{remainder}</strong><small>{seconds === 0 ? 'SESSION COMPLETE' : running ? 'FOCUSING' : 'PAUSED'}</small></div>
        <div className="focus-controls"><button className="button button-secondary" onClick={() => { completionHandled.current = false; setSeconds(durationSeconds); setRunning(true); }}><Icon name="reset" size={15} /> Reset</button><button className="button button-primary" onClick={() => setRunning((value) => !value)} disabled={seconds === 0}><Icon name={running ? 'pause' : 'play'} size={14} /> {running ? 'Pause session' : 'Resume session'}</button></div>
        <span className="focus-private-note"><Icon name="shield" size={13} /> Focus stays on this device in the preview.</span>
      </section>
    </div>
  );
}

type VoiceMessage = { id: string; role: 'you' | 'silverstone'; text: string };

function VoiceAssistantDialog({ tasks, onAddTask, onAddCapture, onStartFocus, onClose }: {
  tasks: AgentTask[];
  onAddTask: (title: string, category: TaskCategory) => void;
  onAddCapture: (text: string, modality?: 'text' | 'voice') => void;
  onStartFocus: () => void;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<VoiceMessage[]>([
    { id: 'welcome', role: 'silverstone', text: "Hi, I'm Silverstone. I can help with your local tasks, notes, and focus sessions. What would you like to do?" },
  ]);
  const [draft, setDraft] = useState('');
  const [interim, setInterim] = useState('');
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [audioReplies, setAudioReplies] = useState(true);
  const [notice, setNotice] = useState('');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(listSpeechVoices);
  const [voiceName, setVoiceName] = useState('');
  const recognitionRef = useRef<SpeechRecognizer | null>(null);
  const finalTranscriptRef = useRef('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const language = typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US';

  useEffect(() => {
    const updateVoices = () => setVoices(listSpeechVoices());
    if ('speechSynthesis' in window) window.speechSynthesis.addEventListener('voiceschanged', updateVoices);
    return () => {
      if ('speechSynthesis' in window) window.speechSynthesis.removeEventListener('voiceschanged', updateVoices);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, interim]);

  useEffect(() => () => {
    recognitionRef.current?.abort();
    stopSpeaking();
  }, []);

  function speakReply(text: string) {
    if (!audioReplies) return;
    const available = speakText(text, language, voiceName, () => setSpeaking(true), () => setSpeaking(false));
    if (!available) setNotice('Audio replies are not available in this browser. The text reply is still here.');
  }

  function handleMessage(rawText: string) {
    const text = rawText.trim();
    if (!text) return;
    setNotice('');
    setDraft('');
    setInterim('');
    setMessages((current) => [...current, { id: createId('turn'), role: 'you', text }]);
    const lower = text.toLowerCase();

    const taskMatch = text.match(/^(?:please\s+)?(?:add|create)\s+(?:a\s+)?task(?:\s+(?:to|for))?\s+(.+)$/i)
      ?? text.match(/^remind me to\s+(.+)$/i);
    if (taskMatch?.[1]) {
      const title = taskMatch[1].trim().replace(/[.!?]+$/, '');
      const category: TaskCategory = /study|learn|revise|read/i.test(title) ? 'Study'
        : /apply|scholarship|job|fellowship|interview|cv|resume/i.test(title) ? 'Career'
          : /portfolio|project|case study/i.test(title) ? 'Portfolio' : 'Personal';
      onAddTask(title, category);
      const reply = `Added “${title}” to your local task list.`;
      setMessages((current) => [...current, { id: createId('turn'), role: 'silverstone', text: reply }]);
      speakReply(reply);
      return;
    }

    const noteMatch = text.match(/^(?:please\s+)?(?:save|remember|capture)\s+(?:that\s+)?(?:a\s+note\s+)?(?:about\s+)?(.+)$/i);
    if (noteMatch?.[1]) {
      const note = noteMatch[1].trim().replace(/[.!?]+$/, '');
      onAddCapture(note, 'voice');
      const reply = 'Saved that as a note in this browser.';
      setMessages((current) => [...current, { id: createId('turn'), role: 'silverstone', text: reply }]);
      speakReply(reply);
      return;
    }

    if (/\b(start|begin|open|launch)\b/.test(lower) && /\bfocus\b/.test(lower)) {
      onStartFocus();
      return;
    }

    if (/\b(today|tasks?|priorit(?:y|ies)|my day|what('?s| is) next|plan)\b/.test(lower)) {
      const open = tasks.filter((task) => !task.done && task.dueLabel !== 'Tomorrow');
      const reply = open.length
        ? `You have ${open.length} open task${open.length === 1 ? '' : 's'} for today. A good next step is: ${open[0].title}${open.length > 1 ? `, followed by ${open[1].title}` : ''}.`
        : 'Your local task list is clear for today. You could take a break or add a small next step.';
      setMessages((current) => [...current, { id: createId('turn'), role: 'silverstone', text: reply }]);
      speakReply(reply);
      return;
    }

    const reply = "I heard you. This preview can read your local tasks, add a task or note, and start a focus session. AI answers across files and connected accounts are not wired up yet.";
    setMessages((current) => [...current, { id: createId('turn'), role: 'silverstone', text: reply }]);
    speakReply(reply);
  }

  function startListening() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = createSpeechRecognizer();
    if (!recognition) {
      setNotice('Voice input is not supported in this browser. You can type in the box below.');
      return;
    }
    stopSpeaking();
    setSpeaking(false);
    finalTranscriptRef.current = '';
    setInterim('');
    setNotice('');
    recognition.lang = language;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const phrase = result[0]?.transcript ?? '';
        if (result.isFinal) finalText += phrase;
        else interimText += phrase;
      }
      if (finalText) finalTranscriptRef.current = `${finalTranscriptRef.current} ${finalText}`.trim();
      setInterim(interimText);
    };
    recognition.onerror = (event) => {
      setListening(false);
      const message = event.error === 'not-allowed' || event.error === 'service-not-allowed'
        ? 'Microphone or speech permission was not granted. You can type instead.'
        : event.error === 'network'
          ? 'This browser needs a network connection for speech recognition.'
          : event.error === 'no-speech'
            ? 'I did not hear speech. Try again when you are ready.'
            : 'Voice input stopped. You can retry or type instead.';
      setNotice(message);
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
      const transcript = finalTranscriptRef.current.trim();
      if (transcript) handleMessage(transcript);
      setInterim('');
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      recognitionRef.current = null;
      setListening(false);
      setNotice('Could not start voice input. Check the browser microphone permission, or type instead.');
    }
  }

  function submitText(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    handleMessage(draft);
  }

  const visibleVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith(language.slice(0, 2).toLowerCase()));

  return (
    <div className="modal-scrim voice-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="voice-dialog" role="dialog" aria-modal="true" aria-labelledby="voice-title">
        <header className="voice-header">
          <div className="voice-agent-mark"><span /><span /><span /></div>
          <div className="voice-header-copy"><span className="panel-eyebrow">SILVERSTONE · VOICE ASSISTANT</span><h2 id="voice-title">Talk it through.</h2></div>
          <button className="icon-button" aria-label="Close voice assistant" onClick={onClose}><Icon name="close" size={18} /></button>
        </header>

        <div className="voice-status-row">
          <span className={`voice-state ${listening ? 'voice-state-listening' : speaking ? 'voice-state-speaking' : ''}`}><i />{listening ? 'Listening to you' : speaking ? 'Speaking reply' : 'Ready when you are'}</span>
          <button className={`voice-audio-toggle ${audioReplies ? 'is-on' : ''}`} onClick={() => { setAudioReplies((current) => !current); if (audioReplies) { stopSpeaking(); setSpeaking(false); } }} aria-pressed={audioReplies}>
            <Icon name={audioReplies ? 'volume' : 'volumeOff'} size={15} /> Audio replies {audioReplies ? 'on' : 'off'}
          </button>
        </div>

        <div className="voice-messages" role="log" aria-live="polite" aria-relevant="additions text">
          <div className="voice-welcome-hint"><Icon name="sparkles" size={14} /><span>Try “What’s on my day?”, “Add a task to review my essay”, or “Save a note about…”</span></div>
          {messages.map((message) => (
            <div className={`voice-message voice-message-${message.role}`} key={message.id}>
              {message.role === 'silverstone' && <span className="message-agent-dot"><span /></span>}
              <p>{message.text}</p>
              {message.role === 'silverstone' && <button className="message-speak" onClick={() => speakReply(message.text)} aria-label="Read this reply aloud"><Icon name="volume" size={14} /></button>}
            </div>
          ))}
          {listening && <div className="voice-interim"><div className="listening-bars"><i /><i /><i /><i /><i /></div><span>{interim || 'Go ahead, I’m listening…'}</span></div>}
          <div ref={messagesEndRef} />
        </div>

        {notice && <div className="voice-notice" role="status">{notice}</div>}

        <form className="voice-composer" onSubmit={submitText}>
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={1} maxLength={500} placeholder="Ask or tell Silverstone something…" aria-label="Type a message to Silverstone" />
          <button type="button" className={`voice-mic-button ${listening ? 'is-listening' : ''}`} onClick={startListening} aria-label={listening ? 'Stop listening' : 'Start voice input'} title={listening ? 'Stop listening' : 'Start voice input'}>
            {listening ? <span className="mic-stop-square" /> : <Icon name="mic" size={18} />}
          </button>
          <button className="voice-send-button" type="submit" disabled={!draft.trim()} aria-label="Send message"><Icon name="send" size={17} /></button>
        </form>

        <footer className="voice-footer">
          <span><Icon name="shield" size={13} /> Silverstone saves no audio. Your browser speech service may process it; this conversation is temporary.</span>
          {visibleVoices.length > 0 && <label className="voice-choice"><span>Voice</span><select value={voiceName} onChange={(event) => setVoiceName(event.target.value)} aria-label="Choose spoken voice"><option value="">Device default</option>{visibleVoices.map((voice) => <option value={voice.name} key={`${voice.name}-${voice.lang}`}>{voice.name}</option>)}</select></label>}
        </footer>
        <div className="voice-processing-note">Speech recognition depends on your browser and may need an internet connection. Transcripts stay in this open panel unless you ask Silverstone to save a task or note.</div>
      </section>
    </div>
  );
}

export default App;
