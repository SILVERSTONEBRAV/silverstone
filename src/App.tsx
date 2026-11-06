import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { Icon, type IconName } from './Icon';
import { askSilverstone, discoverCareerOpportunities, getApiReadiness, type ApiReadinessResponse, type CareerDiscoveryResult } from './api';
import { clearLocalState, createId, createInitialState, createWorkspaceBackup, loadLocalState, localDateKey, parseWorkspaceBackup, saveLocalState } from './store';
import type { CloudWorkspaceSnapshot } from './cloud';
import type { AgentTask, ApplicationDocument, ApplicationDocumentStatus, CareerDraft, CareerDraftKind, CareerEvidence, CareerEvidenceKind, CareerOpportunity, CaptureItem, EligibilityCheck, EligibilityStatus, EmailItem, EmailPriority, EmailStatus, EmailTriageCategory, InterviewAssessmentItem, InterviewFormat, InterviewPrep, InterviewPreparationChecklist, LocalAppState, OpportunityStage, PageKey, PortfolioProject, SocialChannel, SocialPostDraft, StarStory, StudyCard, StudyGoal, StudySession, TaskCategory } from './types';
import { createSpeechRecognizer, listSpeechVoices, speakText, stopSpeaking, type SpeechRecognizer } from './voice';
import { DEFAULT_QUESTIONS_BY_FORMAT, DEFAULT_QUESTIONS_TO_ASK, INTERVIEW_FORMATS, analyzeFillerWords, assessInterviewAnswer, calculateReadiness } from './interview';

type ModalMode = 'task' | 'capture' | null;
type Theme = 'light' | 'dark';
const supabaseConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL?.trim() && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim());
const opportunityStages: OpportunityStage[] = ['Saved', 'Researching', 'Drafting', 'Ready to submit', 'Submitted', 'Interview', 'Offer', 'Closed'];
const socialChannels: SocialChannel[] = ['Facebook', 'Instagram', 'X'];
const scholarshipEligibilitySuggestions = ['Citizenship or residency requirement', 'Study level and program requirement', 'Field of study requirement', 'Academic standing or GPA requirement', 'Funding, duration, and renewal terms'];
const scholarshipDocumentSuggestions = ['Academic transcript', 'Proof of enrollment or admission', 'CV or résumé', 'Personal statement or essay', 'Recommendation letters', 'Identity or eligibility documents'];

const navigation: { label: string; items: { key: PageKey; label: string; icon: IconName }[] }[] = [
  {
    label: 'WORKSPACE',
    items: [
      { key: 'today', label: 'Today', icon: 'home' },
      { key: 'inbox', label: 'Inbox', icon: 'inbox' },
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
  inbox: { title: 'Messages, at your pace.', subtitle: 'Triage selected emails and shape a reply draft. Nothing is connected or sent.', eyebrow: 'LOCAL INBOX' },
  study: { title: 'Study, with intention.', subtitle: 'Build a steady rhythm around the time and energy you actually have.', eyebrow: 'LEARNING SPACE' },
  career: { title: 'Move your next step forward.', subtitle: 'Keep opportunities, applications, and evidence in one calm place.', eyebrow: 'CAREER SPACE' },
  portfolio: { title: 'Show the work behind the work.', subtitle: 'Shape project notes into clear, evidence-backed case studies.', eyebrow: 'YOUR PORTFOLIO' },
  studio: { title: 'Make your ideas travel.', subtitle: 'Develop thoughtful content and prepare it for each channel.', eyebrow: 'CREATOR STUDIO' },
  library: { title: 'Everything worth keeping.', subtitle: 'A searchable home for your notes, links, references, and captures.', eyebrow: 'PERSONAL LIBRARY' },
  observation: { title: 'Context, on your terms.', subtitle: 'Choose what Silverstone can observe and exactly what it may do with that context.', eyebrow: 'OBSERVATION MODE' },
  activity: { title: 'A clear record of what happened.', subtitle: 'Review local changes, suggestions, approvals, and workflow outcomes.', eyebrow: 'YOUR ACTIVITY' },
};

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

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours && remainder) return `${hours}h ${remainder}m`;
  if (hours) return `${hours}h`;
  return `${remainder}m`;
}

function formatPlannedTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time not set';
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

function getStudyWeek(sessions: StudySession[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    const key = localDateKey(date);
    const minutes = sessions
      .filter((session) => localDateKey(new Date(session.completedAt)) === key)
      .reduce((total, session) => total + session.plannedMinutes, 0);
    return { key, date, minutes };
  });
  const maximum = Math.max(60, Math.ceil(Math.max(...days.map((day) => day.minutes)) / 60) * 60);
  return { days, maximum };
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
  const [studyCardEditor, setStudyCardEditor] = useState<StudyCard | null | undefined>(undefined);
  const [portfolioEditor, setPortfolioEditor] = useState<PortfolioProject | null | undefined>(undefined);
  const [careerEditor, setCareerEditor] = useState<CareerOpportunity | null | undefined>(undefined);
  const [careerDraftEditor, setCareerDraftEditor] = useState<CareerDraft | null | undefined>(undefined);
  const [emailEditor, setEmailEditor] = useState<EmailItem | null | undefined>(undefined);
  const [evidenceEditor, setEvidenceEditor] = useState<CareerEvidence | null | undefined>(undefined);
  const [interviewEditor, setInterviewEditor] = useState<{ prep: InterviewPrep | null; opportunityId?: string } | undefined>(undefined);
  const [interviewPractice, setInterviewPractice] = useState<InterviewPrep | undefined>(undefined);
  const [storyEditor, setStoryEditor] = useState<StarStory | null | undefined>(undefined);
  const [socialEditor, setSocialEditor] = useState<SocialPostDraft | null | undefined>(undefined);
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
        setStudyCardEditor(undefined);
        setPortfolioEditor(undefined);
        setCareerEditor(undefined);
        setSocialEditor(undefined);
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

  function saveStudyCard(draft: { topic: string; question: string; answer: string; id?: string }) {
    const now = new Date().toISOString();
    setAppState((current) => {
      const existing = current.studyCards.find((card) => card.id === draft.id);
      if (existing) {
        const nextTopic = draft.topic.trim() || existing.topic;
        const changed = existing.question !== draft.question.trim() || existing.answer !== draft.answer.trim() || existing.topic !== nextTopic;
        const updated: StudyCard = {
          ...existing,
          topic: nextTopic,
          question: draft.question.trim(),
          answer: draft.answer.trim(),
          ...(changed ? { nextReviewAt: now, intervalDays: 0, reviewCount: 0, lastReviewedAt: '' } : {}),
          updatedAt: now,
        };
        return { ...current, studyCards: current.studyCards.map((card) => card.id === existing.id ? updated : card) };
      }
      const card: StudyCard = {
        id: createId('study-card'), topic: draft.topic.trim() || appState.studyGoal?.topic || 'General study',
        question: draft.question.trim(), answer: draft.answer.trim(), nextReviewAt: now, intervalDays: 0, reviewCount: 0,
        lastReviewedAt: '', createdAt: now, updatedAt: now,
      };
      return { ...current, studyCards: [card, ...current.studyCards] };
    });
    setStudyCardEditor(undefined);
    setToast(draft.id ? 'Recall card updated locally' : 'Recall card added to your local deck');
  }

  function reviewStudyCard(id: string, remembered: boolean) {
    const now = new Date();
    setAppState((current) => ({
      ...current,
      studyCards: current.studyCards.map((card) => {
        if (card.id !== id) return card;
        const nextInterval = !remembered ? 0
          : card.intervalDays === 0 ? 1
            : card.intervalDays === 1 ? 3
              : card.intervalDays === 3 ? 7
                : card.intervalDays === 7 ? 14 : 30;
        const nextReview = remembered ? new Date(now.getTime() + nextInterval * 24 * 60 * 60 * 1000) : new Date(now.getTime() + 10 * 60 * 1000);
        return { ...card, intervalDays: nextInterval, reviewCount: card.reviewCount + 1, lastReviewedAt: now.toISOString(), nextReviewAt: nextReview.toISOString(), updatedAt: now.toISOString() };
      }),
    }));
  }

  function savePortfolioProject(draft: { id?: string; title: string; summary: string; content: string }) {
    const savedAt = new Date().toISOString();
    setAppState((current) => {
      const existing = current.portfolioProjects.find((project) => project.id === draft.id);
      const project: PortfolioProject = existing
        ? {
            ...existing,
            title: draft.title,
            summary: draft.summary,
            content: draft.content,
            updatedAt: savedAt,
            versions: existing.title === draft.title && existing.summary === draft.summary && existing.content === draft.content
              ? existing.versions
              : [{ id: createId('portfolio-version'), title: existing.title, summary: existing.summary, content: existing.content, savedAt: existing.updatedAt }, ...existing.versions].slice(0, 30),
          }
        : { id: createId('portfolio-project'), title: draft.title, summary: draft.summary, content: draft.content, updatedAt: savedAt, versions: [] };
      const portfolioProjects = existing
        ? current.portfolioProjects.map((item) => item.id === existing.id ? project : item)
        : [project, ...current.portfolioProjects];
      return { ...current, portfolioProjects };
    });
    setPortfolioEditor(undefined);
    setToast('Portfolio draft saved locally');
  }

  function saveCareerOpportunity(draft: Omit<CareerOpportunity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
    const updatedAt = new Date().toISOString();
    setAppState((current) => {
      const existing = current.careerOpportunities.find((opportunity) => opportunity.id === draft.id);
      const opportunity: CareerOpportunity = existing
        ? { ...existing, ...draft, id: existing.id, updatedAt }
        : { ...draft, id: createId('opportunity'), createdAt: updatedAt, updatedAt };
      const careerOpportunities = existing
        ? current.careerOpportunities.map((item) => item.id === existing.id ? opportunity : item)
        : [opportunity, ...current.careerOpportunities];
      return { ...current, careerOpportunities };
    });
    setCareerEditor(undefined);
    setToast('Opportunity saved locally');
  }

  function saveCareerDraft(draft: Omit<CareerDraft, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
    const updatedAt = new Date().toISOString();
    setAppState((current) => {
      const existing = current.careerDrafts.find((item) => item.id === draft.id);
      const record: CareerDraft = existing
        ? { ...existing, ...draft, id: existing.id, updatedAt }
        : { ...draft, id: createId('career-draft'), createdAt: updatedAt, updatedAt };
      const careerDrafts = existing
        ? current.careerDrafts.map((item) => item.id === existing.id ? record : item)
        : [record, ...current.careerDrafts];
      return { ...current, careerDrafts };
    });
    setCareerDraftEditor(undefined);
    setToast(draft.id ? 'Application draft updated locally' : 'Application draft saved locally');
  }

  function deleteCareerDraft(id: string) {
    setAppState((current) => ({ ...current, careerDrafts: current.careerDrafts.filter((item) => item.id !== id) }));
    setToast('Application draft removed');
  }

  function saveEmailItem(draft: Omit<EmailItem, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
    const updatedAt = new Date().toISOString();
    setAppState((current) => {
      const existing = current.emailItems.find((item) => item.id === draft.id);
      const email: EmailItem = existing
        ? { ...existing, ...draft, id: existing.id, updatedAt }
        : { ...draft, id: createId('email-item'), createdAt: updatedAt, updatedAt };
      const emailItems = existing
        ? current.emailItems.map((item) => item.id === existing.id ? email : item)
        : [email, ...current.emailItems];
      return { ...current, emailItems };
    });
    setEmailEditor(undefined);
    setToast(draft.id ? 'Email record updated locally' : 'Email added to your local inbox');
  }

  function deleteEmailItem(id: string) {
    setAppState((current) => ({ ...current, emailItems: current.emailItems.filter((item) => item.id !== id) }));
    setToast('Email record removed from this device');
  }

  function saveCareerEvidence(draft: { id?: string; kind: CareerEvidenceKind; title: string; organization: string; timeframe: string; details: string; skills: string[]; sourceLabel: string; sourceUrl: string; verified: boolean }) {
    const updatedAt = new Date().toISOString();
    setAppState((current) => {
      const existing = current.careerEvidence.find((item) => item.id === draft.id);
      const { verified, ...fields } = draft;
      const unchanged = Boolean(existing
        && existing.kind === draft.kind
        && existing.title === draft.title
        && existing.organization === draft.organization
        && existing.timeframe === draft.timeframe
        && existing.details === draft.details
        && existing.skills.join('\u0000') === draft.skills.join('\u0000')
        && existing.sourceLabel === draft.sourceLabel
        && existing.sourceUrl === draft.sourceUrl);
      const evidence: CareerEvidence = {
        ...fields,
        id: existing?.id ?? createId('career-evidence'),
        verifiedAt: verified ? (unchanged && existing?.verifiedAt ? existing.verifiedAt : updatedAt) : '',
        createdAt: existing?.createdAt ?? updatedAt,
        updatedAt,
      };
      const careerEvidence = existing
        ? current.careerEvidence.map((item) => item.id === existing.id ? evidence : item)
        : [evidence, ...current.careerEvidence];
      return { ...current, careerEvidence };
    });
    setEvidenceEditor(undefined);
    setToast(draft.id ? 'Evidence record updated' : 'Evidence record added');
  }

  function deleteCareerEvidence(id: string) {
    setAppState((current) => ({
      ...current,
      careerEvidence: current.careerEvidence.filter((item) => item.id !== id),
    }));
    setToast('Evidence record removed');
  }

  function saveInterviewPrep(prep: InterviewPrep, showToast = true) {
    const updatedAt = new Date().toISOString();
    setAppState((current) => {
      const existing = current.interviewPreps.find((item) => item.id === prep.id);
      const updated: InterviewPrep = {
        ...prep,
        id: prep.id || createId('interview-prep'),
        updatedAt,
        createdAt: existing?.createdAt ?? updatedAt,
      };
      const interviewPreps = existing
        ? current.interviewPreps.map((item) => (item.id === existing.id ? updated : item))
        : [updated, ...current.interviewPreps];
      return { ...current, interviewPreps };
    });
    setInterviewEditor(undefined);
    if (interviewPractice?.id === prep.id) {
      setInterviewPractice(prep);
    }
    if (showToast) setToast(prep.id ? 'Interview preparation saved' : 'Interview prep added to workspace');
  }

  function deleteInterviewPrep(id: string) {
    setAppState((current) => ({
      ...current,
      interviewPreps: current.interviewPreps.filter((item) => item.id !== id),
    }));
    if (interviewPractice?.id === id) {
      setInterviewPractice(undefined);
    }
    setToast('Interview prep removed');
  }

  function saveStarStory(draft: { id?: string; title: string; competencies: string[]; situation: string; task: string; action: string; result: string; metrics: string }) {
    const updatedAt = new Date().toISOString();
    setAppState((current) => {
      const existing = current.starStories.find((item) => item.id === draft.id);
      const story: StarStory = existing
        ? { ...existing, ...draft, id: existing.id, updatedAt }
        : { ...draft, id: createId('star-story'), createdAt: updatedAt, updatedAt };
      const starStories = existing
        ? current.starStories.map((item) => (item.id === existing.id ? story : item))
        : [story, ...current.starStories];
      return { ...current, starStories };
    });
    setStoryEditor(undefined);
    setToast(draft.id ? 'STAR story updated' : 'STAR story added to bank');
  }

  function deleteStarStory(id: string) {
    setAppState((current) => ({
      ...current,
      starStories: current.starStories.filter((item) => item.id !== id),
    }));
    setToast('Story removed from bank');
  }

  function markStarStoryUsed(id: string) {
    const lastUsedAt = new Date().toISOString();
    setAppState((current) => ({
      ...current,
      starStories: current.starStories.map((story) => story.id === id ? { ...story, lastUsedAt } : story),
    }));
  }

  function addStudyCardFromInterview(question: string, answer: string, topic: string) {
    const now = new Date().toISOString();
    const card: StudyCard = {
      id: createId('study-card'),
      topic: topic || 'Interview Prep',
      question,
      answer,
      nextReviewAt: now,
      intervalDays: 0,
      reviewCount: 0,
      lastReviewedAt: '',
      createdAt: now,
      updatedAt: now,
    };
    setAppState((current) => ({
      ...current,
      studyCards: [card, ...current.studyCards],
    }));
    setToast('Added question to Study recall deck!');
  }

  function saveSocialPost(draft: { id?: string; title: string; body: string; channels: SocialChannel[]; plannedFor: string; timezone: string }) {
    const updatedAt = new Date().toISOString();
    setAppState((current) => {
      const existing = current.socialPosts.find((post) => post.id === draft.id);
      const post: SocialPostDraft = existing
        ? { ...existing, ...draft, id: existing.id, updatedAt }
        : { ...draft, id: createId('social-draft'), createdAt: updatedAt, updatedAt };
      const socialPosts = existing
        ? current.socialPosts.map((item) => item.id === existing.id ? post : item)
        : [post, ...current.socialPosts];
      return { ...current, socialPosts };
    });
    setSocialEditor(undefined);
    setToast('Social post draft saved locally');
  }

  async function restoreWorkspace(serializedBackup: string) {
    const restoredState = parseWorkspaceBackup(serializedBackup);
    await saveLocalState(restoredState);
    setAppState(restoredState);
    setToast('Backup restored on this device');
  }

  async function restoreCloudWorkspace(workspace: LocalAppState) {
    const mergedState: LocalAppState = {
      ...workspace,
      portfolioProjects: appState.portfolioProjects,
      socialPosts: appState.socialPosts,
      emailItems: appState.emailItems,
      careerDrafts: appState.careerDrafts,
    };
    await saveLocalState(mergedState);
    setAppState(mergedState);
    setToast('Online records restored; device-only drafts kept');
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
      setAppState({ version: 13, tasks: [], captures: [], studyGoal: null, studySessions: [], portfolioProjects: [], careerOpportunities: [], socialPosts: [], studyCards: [], interviewPreps: [], starStories: [], careerEvidence: [], emailItems: [], careerDrafts: [] });
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
              state={appState}
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
            <SettingsPage state={appState} theme={theme} onThemeChange={setTheme} onImport={restoreWorkspace} onRestoreCloud={restoreCloudWorkspace} onReset={resetWorkspace} onToast={setToast} />
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
              onAddStudyCard={() => setStudyCardEditor(null)}
              onEditStudyCard={setStudyCardEditor}
              onReviewStudyCard={reviewStudyCard}
              onCreateProject={() => setPortfolioEditor(null)}
              onEditProject={setPortfolioEditor}
              onCreateOpportunity={() => setCareerEditor(null)}
              onEditOpportunity={setCareerEditor}
              onCreateInterview={(opportunityId) => setInterviewEditor({ prep: null, opportunityId })}
              onEditInterview={(prep) => setInterviewEditor({ prep })}
              onPracticeInterview={(prep) => setInterviewPractice(prep)}
              onDeleteInterview={deleteInterviewPrep}
              onCreateStory={() => setStoryEditor(null)}
              onEditStory={setStoryEditor}
              onDeleteStory={deleteStarStory}
              onCreateEvidence={() => setEvidenceEditor(null)}
              onEditEvidence={setEvidenceEditor}
              onDeleteEvidence={deleteCareerEvidence}
              onCreateSocialPost={() => setSocialEditor(null)}
              onEditSocialPost={setSocialEditor}
              onCreateEmail={() => setEmailEditor(null)}
              onEditEmail={setEmailEditor}
              onDeleteEmail={deleteEmailItem}
              onCreateCareerDraft={() => setCareerDraftEditor(null)}
              onEditCareerDraft={setCareerDraftEditor}
              onDeleteCareerDraft={deleteCareerDraft}
            />
          )}
        </main>
        <footer className="app-footer">
          <span>Silverstone is running locally in this browser.</span>
          <span><Icon name="shield" size={13} /> No mail, social, or finance accounts connected</span>
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
          emails={appState.emailItems}
          onClose={() => setSearchOpen(false)}
          onNavigate={(page) => { navigate(page); setSearchOpen(false); }}
        />
      )}
      {focusOpen && <FocusDialog title={focusDetails.title} minutes={focusDetails.minutes} onComplete={completeFocusSession} onClose={() => setFocusOpen(false)} />}
      {studyGoalOpen && <StudyGoalDialog current={appState.studyGoal} onSave={saveStudyGoal} onClose={() => setStudyGoalOpen(false)} />}
      {studyCardEditor !== undefined && <StudyCardDialog current={studyCardEditor} defaultTopic={appState.studyGoal?.topic ?? ''} onSave={saveStudyCard} onClose={() => setStudyCardEditor(undefined)} />}
      {portfolioEditor !== undefined && <PortfolioProjectDialog current={portfolioEditor} onSave={savePortfolioProject} onClose={() => setPortfolioEditor(undefined)} />}
      {careerEditor !== undefined && <CareerOpportunityDialog current={careerEditor} onSave={saveCareerOpportunity} onClose={() => setCareerEditor(undefined)} />}
      {careerDraftEditor !== undefined && <CareerDraftDialog current={careerDraftEditor} opportunities={appState.careerOpportunities} evidence={appState.careerEvidence} onSave={saveCareerDraft} onClose={() => setCareerDraftEditor(undefined)} />}
      {emailEditor !== undefined && <EmailDialog current={emailEditor} onSave={saveEmailItem} onClose={() => setEmailEditor(undefined)} />}
      {evidenceEditor !== undefined && <CareerEvidenceDialog current={evidenceEditor} onSave={saveCareerEvidence} onClose={() => setEvidenceEditor(undefined)} />}
      {interviewEditor !== undefined && (
        <InterviewPrepDialog
          current={interviewEditor.prep}
          initialOpportunityId={interviewEditor.opportunityId}
          opportunities={appState.careerOpportunities}
          onSave={saveInterviewPrep}
          onClose={() => setInterviewEditor(undefined)}
        />
      )}
      {interviewPractice !== undefined && (
        <InterviewPracticeDialog
          prep={interviewPractice}
          starStories={appState.starStories}
          onAddStudyCard={addStudyCardFromInterview}
          onUseStarStory={markStarStoryUsed}
          onSave={saveInterviewPrep}
          onClose={() => setInterviewPractice(undefined)}
        />
      )}
      {storyEditor !== undefined && (
        <StarStoryDialog
          current={storyEditor}
          onSave={saveStarStory}
          onClose={() => setStoryEditor(undefined)}
        />
      )}
      {socialEditor !== undefined && <SocialPostDialog current={socialEditor} onSave={saveSocialPost} onClose={() => setSocialEditor(undefined)} />}
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
  state: LocalAppState;
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

function TodayPage({ state, openTasks, completedTasks, onToggleTask, onStartFocus, onStartStudy, onAddTask, onCapture, onNavigate, onToast }: TodayPageProps) {
  const [planExpanded, setPlanExpanded] = useState(false);
  const todayKey = localDateKey();
  const todayTasks = state.tasks.filter((task) => task.dueLabel !== 'Tomorrow');
  const doneToday = todayTasks.filter((task) => task.done).length;
  const studyGoal = state.studyGoal;
  const checkedInToday = studyGoal?.availabilityDate === todayKey;
  const todayStudyMinutes = state.studySessions
    .filter((session) => localDateKey(new Date(session.completedAt)) === todayKey)
    .reduce((total, session) => total + session.plannedMinutes, 0);
  const { days: studyDays, maximum: studyMaximum } = getStudyWeek(state.studySessions);
  const weekStudyMinutes = studyDays.reduce((total, day) => total + day.minutes, 0);
  const activeOpportunities = state.careerOpportunities.filter((item) => item.stage !== 'Closed');
  const nextOpportunity = [...activeOpportunities].filter((item) => item.deadline).sort((left, right) => left.deadline.localeCompare(right.deadline))[0] ?? null;
  const nextCareerAction = [...activeOpportunities].filter((item) => item.nextAction.trim()).sort((left, right) => (left.nextActionDue || '9999-99-99').localeCompare(right.nextActionDue || '9999-99-99'))[0] ?? null;
  const nextEmailFollowUp = [...state.emailItems].filter((item) => item.followUpDue && !['Done', 'Archived'].includes(item.status)).sort((left, right) => left.followUpDue.localeCompare(right.followUpDue))[0] ?? null;
  const nextInterview = [...state.interviewPreps]
    .filter((item) => item.scheduledAt && new Date(item.scheduledAt).getTime() > Date.now())
    .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt))[0] ?? null;
  const nextPlannedPost = [...state.socialPosts]
    .filter((post) => post.plannedFor && new Date(post.plannedFor).getTime() > Date.now())
    .sort((left, right) => left.plannedFor.localeCompare(right.plannedFor))[0] ?? null;
  const applicationGroups = [
    { label: 'Exploring', stages: ['Saved', 'Researching'], color: 'pipeline-explore' },
    { label: 'Preparing', stages: ['Drafting', 'Ready to submit'], color: 'pipeline-prepare' },
    { label: 'In review', stages: ['Submitted', 'Interview'], color: 'pipeline-review' },
    { label: 'Offer', stages: ['Offer'], color: 'pipeline-offer' },
  ].map((group) => ({ ...group, count: activeOpportunities.filter((item) => group.stages.includes(item.stage)).length }));
  const suggestedStudyMinutes = recommendedStudyBlock(studyGoal);
  const portfolioCount = state.portfolioProjects.length;
  const dueCards = state.studyCards.filter((card) => new Date(card.nextReviewAt).getTime() <= Date.now());
  const careerActionTiming = nextCareerAction?.nextActionDue
    ? nextCareerAction.nextActionDue < todayKey ? `Overdue · ${formatDeadline(nextCareerAction.nextActionDue)}` : nextCareerAction.nextActionDue === todayKey ? 'Due today' : `Due ${formatDeadline(nextCareerAction.nextActionDue)}`
    : 'No date set';
  const emailFollowUpTiming = nextEmailFollowUp?.followUpDue
    ? nextEmailFollowUp.followUpDue < todayKey ? `Overdue · ${formatDeadline(nextEmailFollowUp.followUpDue)}` : nextEmailFollowUp.followUpDue === todayKey ? 'Due today' : `Due ${formatDeadline(nextEmailFollowUp.followUpDue)}`
    : '';
  const radarItems = [
    ...(nextInterview ? [{ icon: 'briefcase' as const, label: 'INTERVIEW', title: `${nextInterview.company} · ${nextInterview.format}`, detail: `${formatPlannedTime(nextInterview.scheduledAt)} · ${nextInterview.readinessScore > 0 ? `${nextInterview.readinessScore}% readiness` : 'Needs prep'}`, onClick: () => onNavigate('career') }] : []),
    ...(dueCards.length ? [{ icon: 'clock' as const, label: 'RECALL', title: `${dueCards.length} recall card${dueCards.length === 1 ? '' : 's'} due`, detail: `Spaced review · ${dueCards[0]?.topic ?? 'General'}`, onClick: () => onNavigate('study') }] : []),
    ...(nextCareerAction ? [{ icon: 'check' as const, label: 'CAREER NEXT ACTION', title: nextCareerAction.nextAction, detail: `${nextCareerAction.title} · ${careerActionTiming}`, onClick: () => onNavigate('career') }] : []),
    ...(nextEmailFollowUp ? [{ icon: 'inbox' as const, label: 'EMAIL FOLLOW-UP', title: nextEmailFollowUp.subject, detail: `${nextEmailFollowUp.sender} · ${emailFollowUpTiming}`, onClick: () => onNavigate('inbox') }] : []),
    ...(studyGoal ? [{ icon: 'book' as const, label: 'STUDY', title: studyGoal.topic, detail: checkedInToday ? `${studyGoal.availableMinutesToday} minutes available · ${suggestedStudyMinutes ? `${suggestedStudyMinutes}-minute session suggested` : 'no time planned today'}` : 'Check in with today’s free time to plan a session.', onClick: () => onNavigate('study') }] : []),
    ...(nextOpportunity ? [{ icon: 'briefcase' as const, label: 'DEADLINE', title: nextOpportunity.title, detail: `${nextOpportunity.kind} · ${formatDeadline(nextOpportunity.deadline)} · ${nextOpportunity.organization}`, onClick: () => onNavigate('career') }] : []),
    ...(nextPlannedPost ? [{ icon: 'send' as const, label: 'CONTENT PLAN', title: nextPlannedPost.title || nextPlannedPost.channels.join(' + '), detail: `${formatPlannedTime(nextPlannedPost.plannedFor)} · local draft plan; nothing is published`, onClick: () => onNavigate('studio') }] : []),
    ...(openTasks[0] ? [{ icon: 'check' as const, label: 'TASK', title: openTasks[0].title, detail: `${openTasks[0].category} · ${openTasks[0].dueLabel}`, onClick: () => onNavigate('today') }] : []),
  ].slice(0, 4);

  return (
    <>
      <div className="page-heading today-heading">
        <div>
          <div className="eyebrow-line"><span className="eyebrow-dot" /> {todayLabel()}</div>
          <h1>{greeting()}<span className="heading-period">.</span></h1>
          <p>{openTasks.length ? `You have ${openTasks.length} open task${openTasks.length === 1 ? '' : 's'} in your local workspace.` : 'Your local task list is clear. Use this space to choose what matters next.'}</p>
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
          <p>{openTasks.length ? 'Pick one useful next step, then leave room for the rest of your day.' : 'Your task list is clear. Plan a small study session or capture what is on your mind.'}</p>
          <div className="hero-actions">
            <button className="button button-light" onClick={onStartFocus}><Icon name="play" size={14} /> Start a focus session</button>
            <button className="hero-link" onClick={() => setPlanExpanded((value) => !value)}>
              {planExpanded ? 'Hide day plan' : 'Review my day'} <Icon name="arrow" size={15} />
            </button>
          </div>
          {planExpanded && <div className="plan-note"><Icon name="sparkle" size={14} /> {studyGoal ? (checkedInToday ? `${studyGoal.availableMinutesToday} minutes are available for ${studyGoal.topic}. Silverstone has no calendar connection, so this plan does not account for appointments.` : `Your ${studyGoal.topic} goal is saved. Check in with today’s free time to get a study suggestion.`) : 'Set a study goal and tell Silverstone how much time you have today. Calendar events are not connected.'}</div>}
        </div>
        <div className="hero-visual" aria-label={`${doneToday} of ${todayTasks.length} tracked tasks completed today`}>
          <div className="orbit-ring orbit-ring-one" />
          <div className="orbit-ring orbit-ring-two" />
          <div className="orbit-core">
            <span>TASKS TODAY</span>
            <strong>{doneToday}<span>/{todayTasks.length}</span></strong>
            <small>{openTasks.length} still open</small>
          </div>
          <span className="orbit-spark orbit-spark-one" />
          <span className="orbit-spark orbit-spark-two" />
          <span className="orbit-spark orbit-spark-three" />
        </div>
        <div className="hero-bottomline"><span><Icon name="shield" size={13} /> Your plan stays flexible</span><span>LOCAL PREVIEW DATA</span></div>
      </section>

      <section className="metric-grid" aria-label="Daily overview">
        <MetricCard icon="clock" label="STUDY TIME" value={formatDuration(todayStudyMinutes)} note={`${formatDuration(weekStudyMinutes)} this week`} noteTone="blue" chart={weekStudyMinutes ? studyDays.map((day) => Math.max(4, (day.minutes / studyMaximum) * 100)) : undefined} />
        <MetricCard icon="check" label="TASKS MOVING" value={`${doneToday} / ${todayTasks.length}`} note={openTasks.length ? `${openTasks.length} open` : 'No open tasks'} noteTone="green" progress={todayTasks.length ? (doneToday / todayTasks.length) * 100 : 0} />
        <MetricCard icon="book" label="STUDY CHECK-IN" value={studyGoal ? (checkedInToday ? `${studyGoal.availableMinutesToday}m` : 'Check in') : 'Set a goal'} note={studyGoal?.topic ?? 'No active study goal'} noteTone="violet" />
        <MetricCard icon="calendar" label="NEXT DEADLINE" value={nextOpportunity ? formatDeadline(nextOpportunity.deadline) : 'None tracked'} note={nextOpportunity?.title ?? 'Add a job or scholarship'} noteTone="amber" />
      </section>

      <div className="dashboard-grid dashboard-grid-main">
        <section className="panel next-panel">
          <PanelHeading eyebrow="A GOOD PLACE TO START" title="Your next moves" action="View all" onAction={() => onNavigate('study')} />
          <div className="next-move-list">
            <NextMove icon="book" tone="blue" tag="STUDY" title={studyGoal ? (recommendedStudyBlock(studyGoal) ? `Continue ${studyGoal.topic}` : `Check in for ${studyGoal.topic}`) : 'Set your first study goal'} subtitle={studyGoal ? (recommendedStudyBlock(studyGoal) ? 'Your local study plan · one gentle block' : 'Update your free time to choose a short block') : 'Choose a topic and tell Silverstone your free time'} meta={studyGoal ? (recommendedStudyBlock(studyGoal) ? `${recommendedStudyBlock(studyGoal)} min` : 'Check in') : 'Plan'} onClick={studyGoal ? () => { const block = recommendedStudyBlock(studyGoal); if (block) onStartStudy(studyGoal.topic, block, studyGoal.id); else onNavigate('study'); } : () => onNavigate('study')} />
            <NextMove icon="briefcase" tone="violet" tag="CAREER" title={nextOpportunity?.title ?? 'Track a job or scholarship'} subtitle={nextOpportunity ? `${nextOpportunity.kind} · ${nextOpportunity.organization} · due ${formatDeadline(nextOpportunity.deadline)}` : 'Save an opportunity and its deadline'} meta={nextOpportunity ? nextOpportunity.stage : 'Add'} onClick={() => onNavigate('career')} />
            <NextMove icon="layers" tone="green" tag="PORTFOLIO" title={portfolioCount ? 'Continue a portfolio project' : 'Start your portfolio story'} subtitle={portfolioCount ? `${portfolioCount} local project draft${portfolioCount === 1 ? '' : 's'} saved` : 'Create a project draft from your work'} meta={portfolioCount ? 'Open drafts' : 'Create'} onClick={() => onNavigate('portfolio')} />
          </div>
          <button className="panel-foot-link" onClick={() => onToast('Today’s suggestions use saved local tasks, study goals, opportunities, and portfolio drafts.')}>
            <span><Icon name="sparkle" size={14} /> Why these suggestions?</span><Icon name="arrow" size={14} />
          </button>
        </section>

        <section className="panel agenda-panel">
          <PanelHeading eyebrow="SAVED LOCAL CONTEXT" title="Your current radar" action="Study space" onAction={() => onNavigate('study')} />
          <div className="radar-list">
            {radarItems.map((item) => <RadarRow key={`${item.label}-${item.title}`} {...item} />)}
            {!radarItems.length && <div className="empty-state compact"><span className="empty-icon"><Icon name="sparkle" /></span><strong>Nothing queued yet.</strong><span>Add a task, set a study goal, or save a career deadline to see it here.</span></div>}
          </div>
          <div className="agenda-note"><Icon name="shield" size={14} /> Calendar and external publishing are not connected.</div>
        </section>
      </div>

      <div className="dashboard-grid dashboard-grid-lower">
        <section className="panel focus-panel">
          <PanelHeading eyebrow="A STEADY RHYTHM" title="Study time this week" action="Study space" onAction={() => onNavigate('study')} />
          <div className="focus-chart-wrap">
            <div className="chart-y-labels"><span>{formatDuration(studyMaximum)}</span><span>{formatDuration(Math.round(studyMaximum * 2 / 3))}</span><span>{formatDuration(Math.round(studyMaximum / 3))}</span><span>0m</span></div>
            <div className="focus-chart" role="img" aria-label={`Recorded study time over the last seven days, ${weekStudyMinutes} minutes total`}>
              <div className="chart-grid-lines"><span /><span /><span /><span /></div>
              <div className="study-bars" aria-hidden="true">{studyDays.map((day) => <div className="study-bar-column" key={day.key}><i title={`${day.minutes} study minutes`} style={{ height: `${day.minutes ? Math.max(3, (day.minutes / studyMaximum) * 100) : 0}%` }} /></div>)}</div>
              <div className="chart-x-labels">{studyDays.map((day) => <span key={day.key}>{new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(day.date).slice(0, 2).toUpperCase()}</span>)}</div>
            </div>
          </div>
          <div className="focus-summary"><span className="focus-summary-dot" /> {weekStudyMinutes ? 'Recorded study time this week' : 'Complete a study session to start your chart'} <strong>{formatDuration(weekStudyMinutes)}</strong></div>
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
          <div className="opportunity-summary"><strong>{activeOpportunities.length}</strong><span>active job and scholarship opportunities</span></div>
          <div className="pipeline-track" role="img" aria-label={applicationGroups.map((group) => `${group.label}: ${group.count}`).join(', ')}>{applicationGroups.map((group) => <span key={group.label} className={group.color} style={{ width: activeOpportunities.length ? `${(group.count / activeOpportunities.length) * 100}%` : '0%' }} title={`${group.label}: ${group.count}`} />)}</div>
          <div className="pipeline-labels">{applicationGroups.map((group) => <span key={group.label}>{group.label} {group.count}</span>)}</div>
          <div className="next-deadline"><span className="deadline-icon"><Icon name="calendar" size={15} /></span><span><small>{nextOpportunity ? 'NEXT SAVED DEADLINE' : 'NO DEADLINE TRACKED'}</small><strong>{nextOpportunity ? `${nextOpportunity.title} · ${formatDeadline(nextOpportunity.deadline)}` : 'Add a job or scholarship to track it here.'}</strong></span><Icon name="arrow" size={15} /></div>
        </section>

        <section className="observation-card">
          <div className="observation-top"><span className="observation-icon"><Icon name="scan" size={17} /></span><span className="status-pill status-off"><span /> OFF</span></div>
          <p className="eyebrow">YOUR CONTEXT, YOUR CHOICE</p>
          <h3>Observation is<br />paused.</h3>
          <p className="observation-description">No observation sources or device sensors are connected. The cloud can store derived notes later, but it does not activate or monitor any sensor.</p>
          <button className="observation-link" onClick={() => onNavigate('observation')}>Explore permissions <Icon name="arrow" size={15} /></button>
          <div className="observation-grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
        </section>
      </div>
      <div className="dashboard-endnote"><Icon name="shield" size={14} /> Charts use your saved local records. Calendar, mail, social, and brokerage connections are not enabled.</div>
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

function RadarRow({ icon, label, title, detail, onClick }: { icon: IconName; label: string; title: string; detail: string; onClick?: () => void }) {
  const content = (
    <>
      <span className="radar-icon"><Icon name={icon} size={15} /></span>
      <span className="radar-copy"><small>{label}</small><strong>{title}</strong><span>{detail}</span></span>
    </>
  );
  if (onClick) {
    return <button className="radar-row radar-row-button" type="button" onClick={onClick}>{content}</button>;
  }
  return <div className="radar-row">{content}</div>;
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

function ModulePage({ page, state, onNavigate, onAddTask, onCapture, onToast, onPlanStudy, onStartStudy, onAddStudyCard, onEditStudyCard, onReviewStudyCard, onCreateProject, onEditProject, onCreateOpportunity, onEditOpportunity, onCreateInterview, onEditInterview, onPracticeInterview, onDeleteInterview, onCreateStory, onEditStory, onDeleteStory, onCreateEvidence, onEditEvidence, onDeleteEvidence, onCreateSocialPost, onEditSocialPost, onCreateEmail, onEditEmail, onDeleteEmail, onCreateCareerDraft, onEditCareerDraft, onDeleteCareerDraft }: {
  page: Exclude<PageKey, 'today' | 'settings'>;
  state: LocalAppState;
  onNavigate: (page: PageKey) => void;
  onAddTask: () => void;
  onCapture: () => void;
  onToast: (message: string) => void;
  onPlanStudy: () => void;
  onStartStudy: (topic: string, minutes: number, goalId: string) => void;
  onAddStudyCard: () => void;
  onEditStudyCard: (card: StudyCard) => void;
  onReviewStudyCard: (id: string, remembered: boolean) => void;
  onCreateProject: () => void;
  onEditProject: (project: PortfolioProject) => void;
  onCreateOpportunity: () => void;
  onEditOpportunity: (opportunity: CareerOpportunity) => void;
  onCreateInterview: (opportunityId?: string) => void;
  onEditInterview: (prep: InterviewPrep) => void;
  onPracticeInterview: (prep: InterviewPrep) => void;
  onDeleteInterview: (id: string) => void;
  onCreateStory: () => void;
  onEditStory: (story: StarStory) => void;
  onDeleteStory: (id: string) => void;
  onCreateEvidence: () => void;
  onEditEvidence: (evidence: CareerEvidence) => void;
  onDeleteEvidence: (id: string) => void;
  onCreateSocialPost: () => void;
  onEditSocialPost: (post: SocialPostDraft) => void;
  onCreateEmail: () => void;
  onEditEmail: (email: EmailItem) => void;
  onDeleteEmail: (id: string) => void;
  onCreateCareerDraft: () => void;
  onEditCareerDraft: (draft: CareerDraft) => void;
  onDeleteCareerDraft: (id: string) => void;
}) {
  const copy = pageCopy[page];
  return (
    <>
      <div className="page-heading module-heading">
        <div><div className="eyebrow-line"><span className="eyebrow-dot" /> {copy.eyebrow}</div><h1>{copy.title}</h1><p>{copy.subtitle}</p></div>
        <div className="heading-actions">
          <button className="button button-secondary" onClick={onCapture}><Icon name="sparkle" size={16} /> Capture</button>
          <button className="button button-primary" onClick={page === 'library' ? onCapture : page === 'inbox' ? onCreateEmail : onAddTask}><Icon name="plus" size={16} /> {page === 'library' ? 'Add a note' : page === 'inbox' ? 'Add email' : 'Add a task'}</button>
        </div>
      </div>
      {page === 'study' && <StudyModule goal={state.studyGoal} sessions={state.studySessions} cards={state.studyCards} onPlan={onPlanStudy} onStart={onStartStudy} onAddCard={onAddStudyCard} onEditCard={onEditStudyCard} onReviewCard={onReviewStudyCard} />}
      {page === 'career' && (
        <CareerModule
          opportunities={state.careerOpportunities}
          interviewPreps={state.interviewPreps}
          starStories={state.starStories}
          careerEvidence={state.careerEvidence}
          careerDrafts={state.careerDrafts}
          onCreate={onCreateOpportunity}
          onEdit={onEditOpportunity}
          onCreateInterview={onCreateInterview}
          onEditInterview={onEditInterview}
          onPracticeInterview={onPracticeInterview}
          onDeleteInterview={onDeleteInterview}
          onCreateStory={onCreateStory}
          onEditStory={onEditStory}
          onDeleteStory={onDeleteStory}
          onCreateEvidence={onCreateEvidence}
          onEditEvidence={onEditEvidence}
          onDeleteEvidence={onDeleteEvidence}
          onCreateCareerDraft={onCreateCareerDraft}
          onEditCareerDraft={onEditCareerDraft}
          onDeleteCareerDraft={onDeleteCareerDraft}
        />
      )}
      {page === 'portfolio' && <PortfolioModule projects={state.portfolioProjects} onCreate={onCreateProject} onEdit={onEditProject} />}
      {page === 'studio' && <StudioModule posts={state.socialPosts} onCreate={onCreateSocialPost} onEdit={onEditSocialPost} />}
      {page === 'library' && <LibraryModule captures={state.captures} onCapture={onCapture} />}
      {page === 'inbox' && <EmailDesk emails={state.emailItems} onCreate={onCreateEmail} onEdit={onEditEmail} onDelete={onDeleteEmail} onToast={onToast} />}
      {page === 'observation' && <ObservationModule onToast={onToast} />}
      {page === 'activity' && <ActivityModule state={state} />}
      <div className="module-footer-link"><button className="text-action" onClick={() => onNavigate('today')}>Back to Today <Icon name="arrow" size={14} /></button></div>
    </>
  );
}

function StudyModule({ goal, sessions, cards, onPlan, onStart, onAddCard, onEditCard, onReviewCard }: {
  goal: StudyGoal | null;
  sessions: StudySession[];
  cards: StudyCard[];
  onPlan: () => void;
  onStart: (topic: string, minutes: number, goalId: string) => void;
  onAddCard: () => void;
  onEditCard: (card: StudyCard) => void;
  onReviewCard: (id: string, remembered: boolean) => void;
}) {
  const [revealedCardId, setRevealedCardId] = useState<string | null>(null);
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const completedMinutes = sessions
    .filter((session) => goal && session.goalId === goal.id && new Date(session.completedAt).getTime() >= weekAgo)
    .reduce((total, session) => total + session.plannedMinutes, 0);
  const targetMinutes = goal?.weeklyTargetMinutes ?? 0;
  const progress = targetMinutes ? Math.min(100, Math.round((completedMinutes / targetMinutes) * 100)) : 0;
  const recommendedMinutes = recommendedStudyBlock(goal);
  const checkedInToday = goal?.availabilityDate === localDateKey();
  const dueCards = cards.filter((card) => new Date(card.nextReviewAt).getTime() <= Date.now()).sort((left, right) => left.nextReviewAt.localeCompare(right.nextReviewAt));
  const dueCard = dueCards[0] ?? null;
  const deckCards = [...cards].sort((left, right) => left.nextReviewAt.localeCompare(right.nextReviewAt));

  return (
    <div className="module-layout">
      <section className="module-hero study-module-hero">
        <div><span className="panel-eyebrow">YOUR STUDY PLAN</span><h2>{goal ? <>Make progress on<br />{goal.topic}.</> : <>Build understanding<br />one session at a time.</>}</h2><p>{goal ? `${Math.round(goal.weeklyTargetMinutes / 60 * 10) / 10} hours this week · ${checkedInToday ? `${goal.availableMinutesToday} minutes available today` : 'check in with today’s free time'}.` : 'Choose a topic, set a weekly target, and tell Silverstone how much time you have today.'}</p><div className="study-actions"><button className="button button-primary" onClick={onPlan}><Icon name="target" size={14} /> {goal ? (checkedInToday ? 'Adjust my goal' : 'Check in for today') : 'Set a study goal'}</button>{goal && recommendedMinutes > 0 && <button className="button button-secondary" onClick={() => onStart(goal.topic, recommendedMinutes, goal.id)}><Icon name="play" size={14} /> Start {recommendedMinutes} minutes</button>}</div></div>
        <div className="study-score"><span>LAST 7 DAYS</span><strong>{progress}<small>%</small></strong><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><small>{goal ? `${completedMinutes}m of ${targetMinutes}m` : 'Set a goal to track progress'}</small></div>
      </section>
      <section className="module-stats"><MiniStat value={String(cards.length)} label="Cards in your deck" icon="book" /><MiniStat value={String(dueCards.length)} label="Due for review" icon="clock" /><MiniStat value={String(cards.filter((card) => card.intervalDays > 0).length)} label="In review rhythm" icon="trend" /></section>
      <section className="panel module-panel"><PanelHeading eyebrow="ACTIVE RECALL" title={dueCard ? 'Pause and retrieve.' : 'Your learning deck'} action="Add a card" onAction={onAddCard} />{dueCard ? <article className="study-recall-card"><div className="study-recall-meta"><span>{dueCard.topic}</span><small>{dueCards.length} due now</small></div><strong className="study-recall-question">{dueCard.question}</strong>{revealedCardId === dueCard.id ? <><div className="study-recall-answer" aria-live="polite">{dueCard.answer}</div><div className="study-review-actions"><button className="button button-secondary" onClick={() => { onReviewCard(dueCard.id, false); setRevealedCardId(null); }}>Review again<Icon name="reset" size={14} /></button><button className="button button-primary" onClick={() => { onReviewCard(dueCard.id, true); setRevealedCardId(null); }}><Icon name="check" size={14} /> Got it</button></div></> : <button className="button button-secondary" onClick={() => setRevealedCardId(dueCard.id)}>Reveal answer<Icon name="arrow" size={14} /></button>}</article> : <div className="study-empty"><span className="empty-icon"><Icon name="book" /></span><strong>{cards.length ? 'You are clear for now.' : 'Start a small recall deck.'}</strong><span>{cards.length ? 'Your next cards will appear here when they are due.' : 'Write a question and answer from material you are studying. New cards are ready for practice right away.'}</span><button className="button button-secondary" onClick={onAddCard}><Icon name="plus" size={14} /> Add a recall card</button></div>}</section>
      {goal && <section className="panel module-panel"><PanelHeading eyebrow="WEEKLY FOCUS" title="Your learning plan" action="Edit study plan" onAction={onPlan} /><div className="learning-list"><LearningRow icon="book" title={goal.topic} detail={`${completedMinutes} minutes logged in the last 7 days`} percent={progress ? `${progress}%` : 'Ready'} tone="blue" /></div></section>}
      {deckCards.length > 0 && <section className="panel module-panel"><PanelHeading eyebrow="CARD LIBRARY" title="Coming up next" action={`${cards.length} card${cards.length === 1 ? '' : 's'}`} /><div className="study-card-list">{deckCards.map((card) => { const isDue = new Date(card.nextReviewAt).getTime() <= Date.now(); return <button className="study-card-row" key={card.id} onClick={() => onEditCard(card)}><span className="study-card-row-icon"><Icon name="book" size={15} /></span><span><strong>{card.question}</strong><small>{card.topic} · {isDue ? 'Due now' : `Due ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(card.nextReviewAt))}`}</small></span><span className="learning-status status-blue">{card.reviewCount} review{card.reviewCount === 1 ? '' : 's'}</span></button>; })}</div></section>}
      <section className="module-cards"><MiniInfoCard icon="clock" title="Today’s availability" body={goal ? (checkedInToday ? `${goal.availableMinutesToday} minutes available today. Your plan suggests a ${recommendedMinutes || 'rest'} session.` : 'Your last availability check is from another day. Update it when you know what time you have today.') : 'Tell Silverstone how much time you have today, and it will suggest a small session.'} /><MiniInfoCard icon="sparkle" title="A helpful next step" body="Use a short recall session, then note what still feels unclear." /></section>
    </div>
  );
}

function LearningRow({ icon, title, detail, percent, tone }: { icon: IconName; title: string; detail: string; percent: string; tone: string }) {
  return <div className="learning-row"><span className={`move-icon move-${tone}`}><Icon name={icon} size={17} /></span><span className="learning-copy"><strong>{title}</strong><small>{detail}</small></span><span className={`learning-status status-${tone}`}>{percent}</span><Icon name="chevron" size={15} />
  </div>;
}

function formatDeadline(deadline: string): string {
  if (!deadline) return 'No date';
  const date = new Date(`${deadline}T12:00:00`);
  return Number.isNaN(date.getTime()) ? 'Invalid date' : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function CareerModule({
  opportunities,
  interviewPreps,
  starStories,
  onCreate,
  onEdit,
  onCreateInterview,
  onEditInterview,
  onPracticeInterview,
  onDeleteInterview,
  onCreateStory,
  onEditStory,
  onDeleteStory,
  careerEvidence,
  careerDrafts,
  onCreateEvidence,
  onEditEvidence,
  onDeleteEvidence,
  onCreateCareerDraft,
  onEditCareerDraft,
  onDeleteCareerDraft,
}: {
  opportunities: CareerOpportunity[];
  interviewPreps: InterviewPrep[];
  starStories: StarStory[];
  careerEvidence: CareerEvidence[];
  careerDrafts: CareerDraft[];
  onCreate: () => void;
  onEdit: (opportunity: CareerOpportunity) => void;
  onCreateInterview: (opportunityId?: string) => void;
  onEditInterview: (prep: InterviewPrep) => void;
  onPracticeInterview: (prep: InterviewPrep) => void;
  onDeleteInterview: (id: string) => void;
  onCreateStory: () => void;
  onEditStory: (story: StarStory) => void;
  onDeleteStory: (id: string) => void;
  onCreateEvidence: () => void;
  onEditEvidence: (evidence: CareerEvidence) => void;
  onDeleteEvidence: (id: string) => void;
  onCreateCareerDraft: () => void;
  onEditCareerDraft: (draft: CareerDraft) => void;
  onDeleteCareerDraft: (id: string) => void;
}) {
  const [tab, setTab] = useState<'pipeline' | 'interviews' | 'evidence' | 'drafts'>('pipeline');
  const [discoveryKind, setDiscoveryKind] = useState<'job' | 'scholarship'>('job');
  const [discoveryQuery, setDiscoveryQuery] = useState('');
  const [discoveryLocation, setDiscoveryLocation] = useState('');
  const [selectedEvidenceIds, setSelectedEvidenceIds] = useState<string[]>([]);
  const [discoveryBusy, setDiscoveryBusy] = useState(false);
  const [discoveryError, setDiscoveryError] = useState('');
  const [discoveryResults, setDiscoveryResults] = useState<CareerDiscoveryResult | null>(null);
  const [discoveryResultsKind, setDiscoveryResultsKind] = useState<'job' | 'scholarship'>('job');
  const activeOpportunities = opportunities.filter((item) => item.stage !== 'Closed');
  const thisMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const dueThisMonth = activeOpportunities.filter((item) => item.deadline.startsWith(thisMonth)).length;
  const readyToSubmit = activeOpportunities.filter((item) => item.stage === 'Ready to submit').length;
  const sortedOpportunities = [...opportunities].sort((left, right) => (left.deadline || '9999-99-99').localeCompare(right.deadline || '9999-99-99'));

  const totalAssessedQuestions = interviewPreps.reduce((acc, prep) => acc + prep.questions.filter((q) => q.score > 0).length, 0);
  const assessedPreps = interviewPreps.filter((p) => p.readinessScore > 0);
  const averageReadiness = assessedPreps.length > 0
    ? Math.round(assessedPreps.reduce((acc, p) => acc + p.readinessScore, 0) / assessedPreps.length)
    : 0;

  async function searchCareerOpportunities(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!discoveryQuery.trim() || discoveryBusy) return;
    const selectedEvidence = careerEvidence.filter((item) => item.verifiedAt && selectedEvidenceIds.includes(item.id));
    const evidence = selectedEvidence.map((item) => [
      `${item.kind}: ${item.title}`,
      item.organization && `Organization: ${item.organization}`,
      item.timeframe && `Timeframe: ${item.timeframe}`,
      item.details && `Details: ${item.details}`,
      item.skills.length && `Skills: ${item.skills.join(', ')}`,
      item.sourceUrl && `Source: ${item.sourceUrl}`,
    ].filter(Boolean).join('\n')).join('\n\n').slice(0, 5_000);
    const requestedKind = discoveryKind;
    setDiscoveryBusy(true);
    setDiscoveryError('');
    setDiscoveryResults(null);
    try {
      setDiscoveryResults(await discoverCareerOpportunities({
        kind: requestedKind,
        query: discoveryQuery.trim(),
        location: discoveryLocation.trim(),
        evidence,
      }));
      setDiscoveryResultsKind(requestedKind);
    } catch (reason) {
      setDiscoveryError(reason instanceof Error ? reason.message : 'Silverstone could not search for opportunities.');
    } finally {
      setDiscoveryBusy(false);
    }
  }

  function reviewDiscoveredOpportunity(item: CareerDiscoveryResult['opportunities'][number]) {
    const now = new Date().toISOString();
    const requirements = item.requirements_to_verify.slice(0, 8);
    const deadline = /^\d{4}-\d{2}-\d{2}$/.test(item.deadline) ? item.deadline : '';
    const kind = discoveryResultsKind === 'job' ? 'Job' : 'Scholarship';
    onEdit({
      id: `discovered-${createId('opportunity')}`,
      kind,
      title: item.title,
      organization: item.organization,
      sourceUrl: item.source_url,
      deadline,
      stage: 'Saved',
      fitNotes: [item.fit_notes, item.overview && `Overview: ${item.overview}`, requirements.length && `Requirements to verify:\n${requirements.map((requirement) => `• ${requirement}`).join('\n')}`, 'Search results are a starting point. Verify details and eligibility at the official source before applying.'].filter(Boolean).join('\n\n'),
      eligibilityItems: kind === 'Scholarship' ? requirements.map((requirement) => ({ id: createId('eligibility'), requirement, status: 'To check' as const, notes: '', sourceUrl: item.source_url })) : [],
      documents: [],
      nextAction: 'Verify current details on the official source',
      nextActionDue: '',
      createdAt: now,
      updatedAt: now,
    });
    setTab('pipeline');
  }

  return (
    <div className="module-layout">
      <div className="subnav-bar">
        <button
          type="button"
          className={`subnav-btn ${tab === 'pipeline' ? 'is-active' : ''}`}
          onClick={() => setTab('pipeline')}
        >
          <Icon name="briefcase" size={15} /> Opportunity Pipeline ({opportunities.length})
        </button>
        <button
          type="button"
          className={`subnav-btn ${tab === 'interviews' ? 'is-active' : ''}`}
          onClick={() => setTab('interviews')}
        >
          <Icon name="target" size={15} /> Interview Prep & Assessment ({interviewPreps.length})
        </button>
        <button
          type="button"
          className={`subnav-btn ${tab === 'evidence' ? 'is-active' : ''}`}
          onClick={() => setTab('evidence')}
        >
          <Icon name="library" size={15} /> Evidence Library ({careerEvidence.length})
        </button>
        <button
          type="button"
          className={`subnav-btn ${tab === 'drafts' ? 'is-active' : ''}`}
          onClick={() => setTab('drafts')}
        >
          <Icon name="file" size={15} /> Application Drafts ({careerDrafts.length})
        </button>
      </div>

      {tab === 'pipeline' ? (
        <>
          <section className="panel module-panel career-discovery-panel">
            <PanelHeading eyebrow="LIVE OPPORTUNITY RESEARCH" title="Search jobs and scholarships" />
            <form className="career-discovery-form" onSubmit={(event) => void searchCareerOpportunities(event)}>
              <div className="career-form-grid">
                <div><label className="field-label" htmlFor="career-discovery-kind">Search for</label><select id="career-discovery-kind" value={discoveryKind} onChange={(event) => setDiscoveryKind(event.target.value as 'job' | 'scholarship')}><option value="job">Jobs</option><option value="scholarship">Scholarships and funding</option></select></div>
                <div><label className="field-label" htmlFor="career-discovery-location">Location or destination</label><input id="career-discovery-location" maxLength={160} value={discoveryLocation} onChange={(event) => setDiscoveryLocation(event.target.value)} placeholder="e.g. Remote, Kenya, UK universities" /></div>
              </div>
              <label className="field-label" htmlFor="career-discovery-query">What should Silverstone look for?</label>
              <div className="career-discovery-query"><input id="career-discovery-query" required maxLength={300} value={discoveryQuery} onChange={(event) => setDiscoveryQuery(event.target.value)} placeholder="e.g. Entry-level data analyst roles using Python and public health" /><button className="button button-primary" type="submit" disabled={discoveryBusy || !discoveryQuery.trim()}><Icon name={discoveryBusy ? 'sparkles' : 'search'} size={15} />{discoveryBusy ? 'Searching the web…' : 'Search the web'}</button></div>
              <details className="career-discovery-evidence"><summary>Compare with verified career evidence <span>optional · {selectedEvidenceIds.filter((id) => careerEvidence.some((item) => item.id === id && item.verifiedAt)).length} selected</span></summary>
                {careerEvidence.some((item) => item.verifiedAt) ? <div className="career-discovery-evidence-list">{careerEvidence.filter((item) => item.verifiedAt).map((item) => <label key={item.id}><input type="checkbox" checked={selectedEvidenceIds.includes(item.id)} onChange={(event) => setSelectedEvidenceIds((current) => event.target.checked ? [...new Set([...current, item.id])] : current.filter((id) => id !== item.id))} /><span><strong>{item.title}</strong><small>{[item.kind, item.organization, item.skills.join(', ')].filter(Boolean).join(' · ')}</small></span></label>)}</div> : <p>Add and verify career evidence in the Evidence Library to compare opportunities against your experience.</p>}
              </details>
              <p className="career-discovery-privacy"><Icon name="shield" size={13} /> Search runs through OpenAI web search. Only your query and evidence you select are sent to OpenAI for this request. Silverstone does not save the search response unless you review an opportunity into your pipeline. Confirm every requirement and deadline at its source.</p>
            </form>
            {discoveryError && <p className="cloud-feedback cloud-error" role="alert">{discoveryError}</p>}
            {discoveryResults && <div className="career-discovery-results"><p className="career-discovery-summary">{discoveryResults.summary || 'Search complete. Review current details at each source.'}</p>
              {discoveryResults.opportunities.length ? <div className="career-discovery-result-list">{discoveryResults.opportunities.map((item, index) => <article className="career-discovery-result" key={`${item.source_url}-${index}`}>
                <div className="career-discovery-result-title"><div><strong>{item.title}</strong><small>{[item.organization, item.location, item.deadline && item.deadline !== 'Unknown' ? `Deadline ${item.deadline}` : 'Deadline not confirmed'].filter(Boolean).join(' · ')}</small></div><a href={item.source_url} target="_blank" rel="noreferrer" aria-label={`Open official source for ${item.title}`}><Icon name="external" size={13} /> Source</a></div>
                <p>{item.overview}</p><p className="career-discovery-fit">Possible fit: {item.fit_notes}</p>
                {item.requirements_to_verify.length > 0 && <div className="career-discovery-requirements"><strong>Check at the source</strong><ul>{item.requirements_to_verify.slice(0, 6).map((requirement, requirementIndex) => <li key={`${requirement}-${requirementIndex}`}>{requirement}</li>)}</ul></div>}
                <button className="button button-secondary" onClick={() => reviewDiscoveredOpportunity(item)}><Icon name="plus" size={13} /> Review and save to pipeline</button>
              </article>)}</div> : <div className="career-empty"><strong>No current matches found.</strong><span>{discoveryResults.summary || 'Try a broader title, location, or study destination.'}</span></div>}
              {discoveryResults.sources.length > 0 && <details className="career-discovery-sources"><summary>Search sources ({discoveryResults.sources.length})</summary><ul>{discoveryResults.sources.slice(0, 12).map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}<Icon name="external" size={11} /></a></li>)}</ul></details>}
            </div>}
          </section>
          <section className="module-stats">
            <MiniStat value={String(activeOpportunities.length)} label="In the pipeline" icon="briefcase" />
            <MiniStat value={String(dueThisMonth)} label="Deadlines this month" icon="calendar" />
            <MiniStat value={String(readyToSubmit)} label="Ready to submit" icon="shield" />
          </section>
          <section className="panel module-panel">
            <PanelHeading eyebrow="YOUR PIPELINE" title="Opportunities in motion" action="Add opportunity" onAction={onCreate} />
            <div className="opportunity-list">
              {sortedOpportunities.length ? (
                sortedOpportunities.map((item) => {
                  const linkedPrep = interviewPreps.find((prep) => prep.opportunityId === item.id);
                  const verifiedEligibility = item.eligibilityItems.filter((entry) => entry.status === 'Meets' || entry.status === 'Does not meet').length;
                  const readyDocuments = item.documents.filter((entry) => entry.status === 'Ready' || entry.status === 'Submitted').length;
                  const eligibilitySummary = item.eligibilityItems.length ? `${verifiedEligibility}/${item.eligibilityItems.length} checked` : 'not started';
                  const documentSummary = item.documents.length ? `${readyDocuments}/${item.documents.length} ready` : 'not started';
                  return (
                    <div className="opportunity-row" key={item.id}>
                      <span className={`opportunity-badge badge-${item.kind === 'Scholarship' ? 'violet' : 'blue'}`}>
                        <Icon name={item.kind === 'Scholarship' ? 'target' : 'briefcase'} size={16} />
                      </span>
                      <span className="opportunity-copy">
                        <strong>{item.title}</strong>
                        <small>{item.kind} · {item.organization}</small>
                        {item.kind === 'Scholarship' && <small className="scholarship-progress">Eligibility {eligibilitySummary} · Documents {documentSummary}</small>}
                        {item.nextAction && <small className="opportunity-next-action">Next: {item.nextAction}{item.nextActionDue ? ` · ${formatDeadline(item.nextActionDue)}` : ''}</small>}
                      </span>
                      <span className="stage-pill">{item.stage}</span>
                      <span className="opportunity-due">
                        <small>DEADLINE</small>
                        <strong>{formatDeadline(item.deadline)}</strong>
                      </span>
                      {linkedPrep ? (
                        <button
                          type="button"
                          className="interview-link-pill"
                          onClick={() => onPracticeInterview(linkedPrep)}
                          title="Open interview prep & assessment"
                        >
                          <Icon name="target" size={12} /> {linkedPrep.format} · {linkedPrep.readinessScore > 0 ? `${linkedPrep.readinessScore}%` : 'Practice'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="interview-link-pill pill-secondary"
                          onClick={() => onCreateInterview(item.id)}
                          title="Prepare an interview for this role"
                        >
                          <Icon name="plus" size={12} /> Prep interview
                        </button>
                      )}
                      {item.sourceUrl && (
                        <a className="icon-button row-chevron opportunity-source" href={item.sourceUrl} target="_blank" rel="noreferrer" aria-label={`Open source for ${item.title}`}>
                          <Icon name="external" size={14} />
                        </a>
                      )}
                      <button className="icon-button row-chevron" aria-label={`Edit ${item.title}`} onClick={() => onEdit(item)}>
                        <Icon name="arrow" size={15} />
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="career-empty">
                  <span className="empty-icon"><Icon name="briefcase" /></span>
                  <strong>Your pipeline starts with an opportunity.</strong>
                  <span>Add a job or scholarship, save its source and deadline, then track your next step here.</span>
                  <button className="button button-secondary" onClick={onCreate}><Icon name="plus" size={15} /> Add an opportunity</button>
                </div>
              )}
            </div>
          </section>
        </>
      ) : tab === 'interviews' ? (
        <>
          <section className="module-stats">
            <MiniStat value={String(interviewPreps.length)} label="Interviews tracked" icon="briefcase" />
            <MiniStat value={String(totalAssessedQuestions)} label="Questions assessed" icon="check" />
            <MiniStat value={averageReadiness ? `${averageReadiness}%` : '—'} label="Average readiness" icon="trend" />
          </section>
          <section className="panel module-panel">
            <PanelHeading eyebrow="MOCK INTERVIEWS & ASSESSMENT" title="Interview preparations" action="New interview prep" onAction={() => onCreateInterview()} />
            <div className="interview-prep-list">
              {interviewPreps.length ? (
                interviewPreps.map((prep) => {
                  const assessedCount = prep.questions.filter((q) => q.score > 0).length;
                  const readinessClass = prep.readinessScore >= 75 ? 'is-high' : prep.readinessScore >= 50 ? 'is-medium' : prep.readinessScore > 0 ? 'is-low' : 'is-empty';
                  const readinessLabel = prep.readinessScore >= 75 ? 'High Readiness' : prep.readinessScore >= 50 ? 'Good Progress' : prep.readinessScore > 0 ? 'Needs Practice' : 'Not Assessed';
                  const linkedOpportunity = opportunities.find((op) => op.id === prep.opportunityId);
                  return (
                    <article className="interview-prep-card" key={prep.id}>
                      <div className="interview-card-header">
                        <div className="interview-card-titles">
                          <small>{prep.company}{linkedOpportunity ? ` · Linked to ${linkedOpportunity.title}` : ''}</small>
                          <strong>{prep.roleTitle}</strong>
                          <span>{prep.focusTopics.length ? prep.focusTopics.join(' · ') : 'General competencies'}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="interview-format-pill">{prep.format}</span>
                          <span className={`readiness-gauge ${readinessClass}`}>
                            {prep.readinessScore > 0 ? `${prep.readinessScore}% ${readinessLabel}` : 'Not Assessed'}
                          </span>
                        </div>
                      </div>
                      <div className="interview-card-meta">
                        <span><Icon name="calendar" size={14} /> {prep.scheduledAt ? formatPlannedTime(prep.scheduledAt) : 'Schedule pending'}</span>
                        {prep.locationOrLink && <span><Icon name="external" size={14} /> {prep.locationOrLink}</span>}
                        {prep.interviewers && <span><Icon name="shield" size={14} /> {prep.interviewers}</span>}
                        <span><Icon name="file" size={14} /> {prep.questions.length} question{prep.questions.length === 1 ? '' : 's'} ({assessedCount} assessed)</span>
                      </div>
                      <div className="interview-card-actions">
                        <button className="button button-primary" onClick={() => onPracticeInterview(prep)}>
                          <Icon name="play" size={14} /> Practice & Assess ({prep.questions.length})
                        </button>
                        <div className="interview-card-actions-right">
                          <button className="button button-secondary" onClick={() => onEditInterview(prep)}>
                            <Icon name="more" size={14} /> Edit setup
                          </button>
                          <button className="icon-button" aria-label={`Delete interview prep for ${prep.roleTitle}`} onClick={() => onDeleteInterview(prep.id)}>
                            <Icon name="close" size={14} />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="empty-state">
                  <span className="empty-icon"><Icon name="target" /></span>
                  <strong>No interview preparations yet.</strong>
                  <span>Create an interview plan manually or link one from your opportunity pipeline. Practice role-specific questions, receive instant STAR assessment feedback, and draft questions to ask the interviewer.</span>
                  <button className="button button-secondary" onClick={() => onCreateInterview()}><Icon name="plus" size={15} /> Create interview prep</button>
                </div>
              )}
            </div>
          </section>
        </>
      ) : tab === 'evidence' ? <CareerEvidenceLibrary evidence={careerEvidence} onCreate={onCreateEvidence} onEdit={onEditEvidence} onDelete={onDeleteEvidence} /> : <CareerDraftStudio drafts={careerDrafts} evidence={careerEvidence} opportunities={opportunities} onCreate={onCreateCareerDraft} onEdit={onEditCareerDraft} onDelete={onDeleteCareerDraft} />}

      <section className="panel module-panel story-bank-panel">
        <PanelHeading eyebrow="REUSABLE INTERVIEW EVIDENCE" title="Your STAR story bank" action="Add a story" onAction={onCreateStory} />
        {starStories.length ? (
          <div className="story-card-list">
            {starStories.map((story) => (
              <article className="story-card" key={story.id}>
                <div className="story-card-header">
                  <div className="story-card-titles"><strong>{story.title}</strong><small>{story.lastUsedAt ? `Last used ${formatPlannedTime(story.lastUsedAt)}` : 'Not used in a practice session yet'}</small></div>
                  {story.metrics && <span className="story-metric-badge"><Icon name="trend" size={12} /> {story.metrics}</span>}
                </div>
                {story.competencies.length > 0 && <div className="competency-tags">{story.competencies.map((competency) => <span className="competency-pill" key={competency}>{competency}</span>)}</div>}
                <div className="star-grid-preview">
                  <div className="star-grid-item"><small>SITUATION</small><p>{story.situation || 'Add the context.'}</p></div>
                  <div className="star-grid-item"><small>TASK</small><p>{story.task || 'Describe your responsibility.'}</p></div>
                  <div className="star-grid-item"><small>ACTION</small><p>{story.action || 'Explain what you did.'}</p></div>
                  <div className="star-grid-item"><small>RESULT</small><p>{story.result || 'Add the outcome.'}</p></div>
                </div>
                <div className="story-card-actions">
                  <button className="button button-secondary" onClick={() => onEditStory(story)}><Icon name="more" size={13} /> Edit story</button>
                  <button className="text-action" onClick={() => { if (window.confirm(`Remove “${story.title}” from your STAR story bank?`)) onDeleteStory(story.id); }}><Icon name="close" size={13} /> Remove</button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state compact"><span className="empty-icon"><Icon name="layers" /></span><strong>Build a bank of real examples.</strong><span>Save a challenge, your role, the actions you took, and the results. You can insert a story into a practice answer, then tailor it to the question.</span><button className="button button-secondary" onClick={onCreateStory}><Icon name="plus" size={14} /> Add your first STAR story</button></div>
        )}
      </section>

      <section className="module-cards">
        <MiniInfoCard icon="target" title="STAR Method evaluation" body="Practice framing behavioral answers with Situation, Task, Action, and measurable Results." />
        <MiniInfoCard icon="sparkle" title="Questions for the team" body="Prepare thoughtful reverse-interview questions about tech debt, culture, and first 90 days." />
      </section>
    </div>
  );
}

function buildCareerDraftContent(kind: CareerDraftKind, targetRole: string, organization: string, selectedEvidence: CareerEvidence[]): string {
  const facts = selectedEvidence.length
    ? selectedEvidence.map((item) => {
      const context = [item.organization, item.timeframe].filter(Boolean).join(' · ');
      return `• ${item.title}${context ? ` — ${context}` : ''}${item.details ? `\n  ${item.details}` : ''}${item.skills.length ? `\n  Skills: ${item.skills.join(', ')}` : ''}`;
    }).join('\n\n')
    : '[Select relevant career evidence, then generate this draft.]';

  if (kind === 'CV excerpt') return `SELECTED CAREER EVIDENCE\n\n${facts}\n\nSKILLS\n${selectedEvidence.flatMap((item) => item.skills).filter((skill, index, all) => all.indexOf(skill) === index).map((skill) => `• ${skill}`).join('\n') || '[Add skills supported by your records.]'}`;
  if (kind === 'Cover letter') return `Dear Hiring Team,\n\nI am applying for ${targetRole || '[Role]'} at ${organization || '[Organization]'}. The following selected experience may be relevant:\n\n${facts}\n\n[Connect these facts to the role using accurate details. Add a specific reason for your interest and review every claim before use.]\n\nThank you for your consideration.\n\n[Your Name]`;
  return `SCHOLARSHIP STATEMENT OUTLINE\n\n1. Motivation\n[Explain why you are applying and what motivates your field of study.]\n\n2. Relevant preparation and experience\n${facts}\n\n3. Learning and career goals\n[Describe your goals and how this scholarship would support them.]\n\n4. Contribution and fit\n[Explain how you meet the published criteria, using accurate, specific examples.]\n\n5. Final review\n[Check eligibility, word limits, required prompts, and every factual claim.]`;
}

function CareerDraftStudio({ drafts, evidence, opportunities, onCreate, onEdit, onDelete }: {
  drafts: CareerDraft[];
  evidence: CareerEvidence[];
  opportunities: CareerOpportunity[];
  onCreate: () => void;
  onEdit: (draft: CareerDraft) => void;
  onDelete: (id: string) => void;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyErrorId, setCopyErrorId] = useState<string | null>(null);
  const verifiedEvidenceCount = evidence.filter((item) => Boolean(item.verifiedAt && (item.sourceLabel.trim() || item.sourceUrl.trim()))).length;
  const reviewCount = drafts.filter((draft) => draft.evidenceIds.some((id) => {
    const item = evidence.find((candidate) => candidate.id === id);
    return !item || !item.verifiedAt || !(item.sourceLabel.trim() || item.sourceUrl.trim());
  })).length;

  async function copyDraft(draft: CareerDraft) {
    try {
      await navigator.clipboard.writeText(draft.content);
      setCopiedId(draft.id);
      setCopyErrorId(null);
      window.setTimeout(() => setCopiedId((current) => current === draft.id ? null : current), 1800);
    } catch {
      setCopiedId(null);
      setCopyErrorId(draft.id);
      window.setTimeout(() => setCopyErrorId((current) => current === draft.id ? null : current), 2200);
    }
  }

  return (
    <div className="career-draft-studio">
      <section className="module-stats">
        <MiniStat value={String(drafts.length)} label="Saved application drafts" icon="file" />
        <MiniStat value={String(verifiedEvidenceCount)} label="Evidence checked by you" icon="check" />
        <MiniStat value={String(reviewCount)} label="Drafts needing source review" icon="shield" />
      </section>
      <section className="panel module-panel career-draft-panel">
        <PanelHeading eyebrow="EVIDENCE-LINKED APPLICATION MATERIAL" title="Application Draft Studio" action="Create a draft" onAction={onCreate} />
        <div className="career-draft-intro"><Icon name="shield" size={15} /><span>Templates use only the records you select. Review every statement and source before using it; verification means you checked the record, not that Silverstone independently confirmed it.</span></div>
        {drafts.length ? <div className="career-draft-list">{[...drafts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((draft) => {
          const linkedEvidence = draft.evidenceIds.map((id) => evidence.find((item) => item.id === id));
          const missingCount = linkedEvidence.filter((item) => !item).length;
          const unverifiedCount = linkedEvidence.filter((item) => item && (!item.verifiedAt || !(item.sourceLabel.trim() || item.sourceUrl.trim()))).length;
          const opportunity = opportunities.find((item) => item.id === draft.opportunityId);
          return <article className="career-draft-card" key={draft.id}>
            <div className="career-draft-card-head"><div><span className="career-draft-kind">{draft.kind}</span><h3>{draft.title}</h3><p>{draft.targetRole || 'No role or program'}{draft.organization ? ` · ${draft.organization}` : ''}{opportunity ? ` · Linked to ${opportunity.kind.toLowerCase()}` : ''}</p></div><span className="career-draft-date">Updated {formatPlannedTime(draft.updatedAt)}</span></div>
            <div className="career-draft-source-summary"><span><Icon name="library" size={13} /> {draft.evidenceIds.length} linked record{draft.evidenceIds.length === 1 ? '' : 's'}</span>{missingCount > 0 && <span className="career-draft-warning"><Icon name="shield" size={12} /> {missingCount} missing record{missingCount === 1 ? '' : 's'}</span>}{unverifiedCount > 0 && <span className="career-draft-warning"><Icon name="clock" size={12} /> {unverifiedCount} need review</span>}{draft.evidenceIds.length === 0 && <span className="career-draft-warning"><Icon name="shield" size={12} /> No evidence linked</span>}</div>
            <details className="career-draft-preview"><summary>Preview draft</summary><pre>{draft.content || 'Draft is empty.'}</pre></details>
            <div className="career-draft-actions"><button className="button button-secondary" onClick={() => onEdit(draft)}><Icon name="more" size={13} /> Edit and review</button><button className="button button-secondary" onClick={() => void copyDraft(draft)}><Icon name="file" size={13} /> {copiedId === draft.id ? 'Copied' : copyErrorId === draft.id ? 'Copy unavailable' : 'Copy text'}</button><button className="text-action career-draft-remove" onClick={() => { if (window.confirm(`Remove “${draft.title}”?`)) onDelete(draft.id); }}><Icon name="close" size={13} /> Remove</button></div>
          </article>;
        })}</div> : <div className="career-draft-empty"><span className="empty-icon"><Icon name="file" /></span><strong>Prepare application material from your own records.</strong><span>Create a CV excerpt, cover letter, or scholarship statement outline. Choose the career evidence you want to cite and review its source status.</span><button className="button button-secondary" onClick={onCreate}><Icon name="plus" size={14} /> Create your first draft</button></div>}
      </section>
    </div>
  );
}

function CareerDraftDialog({ current, opportunities, evidence, onSave, onClose }: {
  current: CareerDraft | null;
  opportunities: CareerOpportunity[];
  evidence: CareerEvidence[];
  onSave: (draft: Omit<CareerDraft, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<CareerDraftKind>(current?.kind ?? 'CV excerpt');
  const [title, setTitle] = useState(current?.title ?? '');
  const [opportunityId, setOpportunityId] = useState(current?.opportunityId ?? '');
  const [targetRole, setTargetRole] = useState(current?.targetRole ?? '');
  const [organization, setOrganization] = useState(current?.organization ?? '');
  const [evidenceIds, setEvidenceIds] = useState<string[]>(current?.evidenceIds ?? []);
  const [content, setContent] = useState(current?.content ?? '');
  const linkedEvidence = evidence.filter((item) => evidenceIds.includes(item.id));
  const missingCount = evidenceIds.filter((id) => !evidence.some((item) => item.id === id)).length;
  const unverifiedCount = linkedEvidence.filter((item) => !item.verifiedAt || !(item.sourceLabel.trim() || item.sourceUrl.trim())).length;
  const selectedOpportunity = opportunities.find((item) => item.id === opportunityId);

  function generate() {
    setContent(buildCareerDraftContent(kind, targetRole.trim(), organization.trim(), linkedEvidence));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({ id: current?.id, kind, title: title.trim(), opportunityId: opportunityId || undefined, targetRole: targetRole.trim(), organization: organization.trim(), content: content.trim(), evidenceIds: [...new Set(evidenceIds)].slice(0, 40) });
  }

  return <div className="modal-scrim career-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="dialog-card career-dialog career-draft-dialog" role="dialog" aria-modal="true" aria-labelledby="career-draft-dialog-title">
    <div className="dialog-top"><span className="dialog-icon"><Icon name="file" size={18} /></span><button className="icon-button" aria-label="Close application draft editor" onClick={onClose}><Icon name="close" size={17} /></button></div>
    <span className="panel-eyebrow">CAREER · DRAFT STUDIO</span><h2 id="career-draft-dialog-title">{current ? 'Review your application draft.' : 'Start with evidence you trust.'}</h2><p>This local template does not send applications or invent experience. Select records, generate a starting structure, then edit and verify it yourself.</p>
    <form onSubmit={submit}>
      <div className="career-form-grid"><div><label className="field-label" htmlFor="career-draft-kind">Draft type</label><select id="career-draft-kind" value={kind} onChange={(event) => setKind(event.target.value as CareerDraftKind)}>{(['CV excerpt', 'Cover letter', 'Scholarship statement outline'] as CareerDraftKind[]).map((item) => <option key={item}>{item}</option>)}</select></div><div><label className="field-label" htmlFor="career-draft-title">Draft title</label><input id="career-draft-title" required maxLength={180} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Research fellowship application" /></div></div>
      <label className="field-label" htmlFor="career-draft-opportunity">Link an opportunity (optional)</label><select id="career-draft-opportunity" value={opportunityId} onChange={(event) => { const id = event.target.value; const selected = opportunities.find((item) => item.id === id); setOpportunityId(id); if (selected) { setTargetRole(selected.title); setOrganization(selected.organization); } }}><option value="">No linked opportunity</option>{opportunities.map((item) => <option key={item.id} value={item.id}>{item.kind}: {item.title} · {item.organization}</option>)}</select>
      <div className="career-form-grid"><div><label className="field-label" htmlFor="career-draft-role">Role or program</label><input id="career-draft-role" maxLength={160} value={targetRole} onChange={(event) => setTargetRole(event.target.value)} placeholder="Role, course, or program" /></div><div><label className="field-label" htmlFor="career-draft-organization">Organization</label><input id="career-draft-organization" maxLength={160} value={organization} onChange={(event) => setOrganization(event.target.value)} placeholder="Employer, school, or funder" /></div></div>
      <div className="career-draft-evidence-picker"><div className="career-draft-picker-head"><span><strong>Choose evidence to include</strong><small>{evidence.length ? 'Only selected records are copied into the generated structure.' : 'Add records in the Evidence Library first.'}</small></span><button className="button button-secondary" type="button" onClick={generate} disabled={!evidenceIds.length}>Generate structure</button></div>
        {evidence.length ? <div className="career-draft-picker-list">{evidence.map((item) => {
          const hasSource = Boolean(item.sourceLabel.trim() || item.sourceUrl.trim());
          const verified = Boolean(item.verifiedAt && hasSource);
          return <div className="career-draft-picker-item" key={item.id}><input type="checkbox" aria-label={`Include ${item.title}`} checked={evidenceIds.includes(item.id)} onChange={(event) => setEvidenceIds((ids) => event.target.checked ? [...new Set([...ids, item.id])].slice(0, 40) : ids.filter((id) => id !== item.id))} /><span><strong>{item.title}</strong><small>{[item.kind, item.organization, item.timeframe].filter(Boolean).join(' · ') || 'Career record'}</small><small>{hasSource ? `Source: ${item.sourceLabel || 'Saved source link'}` : 'No source recorded'}</small></span>{item.sourceUrl && <a className="career-draft-source-link" href={item.sourceUrl} target="_blank" rel="noreferrer">Open source <Icon name="external" size={11} /></a>}<em className={verified ? 'draft-source-verified' : 'draft-source-review'}>{verified ? 'Checked by you' : hasSource ? 'Needs review' : 'No source'}</em></div>;
        })}</div> : <div className="career-draft-no-evidence">Your facts stay yours. Add a sourced record to the Evidence Library before generating a draft.</div>}
      </div>
      {(missingCount > 0 || unverifiedCount > 0 || evidenceIds.length === 0) && <div className="career-draft-dialog-warning"><Icon name="shield" size={14} /><span>{missingCount > 0 ? `${missingCount} selected record${missingCount === 1 ? ' is' : 's are'} no longer in the library. ` : ''}{unverifiedCount > 0 ? `${unverifiedCount} selected record${unverifiedCount === 1 ? ' needs' : 's need'} a source review. ` : ''}{evidenceIds.length === 0 ? 'Select a record to generate a structure, or write your own draft below.' : 'Verification is user-confirmed and is not an independent fact check.'}</span></div>}
      {selectedOpportunity && <div className="career-draft-linked-note"><Icon name="external" size={13} /> Linked to {selectedOpportunity.kind.toLowerCase()} · {selectedOpportunity.title}</div>}
      <label className="field-label" htmlFor="career-draft-content">Draft content · review and edit before use</label><textarea id="career-draft-content" rows={13} maxLength={20000} value={content} onChange={(event) => setContent(event.target.value)} placeholder="Choose evidence and generate a starting structure, or write your draft here." />
      <div className="dialog-foot"><span><Icon name="shield" size={13} /> Stored in your local workspace</span><div className="career-editor-actions"><button className="button button-secondary" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={!title.trim() || !content.trim()}>{current ? 'Save draft' : 'Save draft'}<Icon name="arrow" size={14} /></button></div></div>
    </form>
  </section></div>;
}

function CareerEvidenceLibrary({ evidence, onCreate, onEdit, onDelete }: {
  evidence: CareerEvidence[];
  onCreate: () => void;
  onEdit: (evidence: CareerEvidence) => void;
  onDelete: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'verified' | 'review'>('all');
  const verifiedCount = evidence.filter((item) => Boolean(item.verifiedAt)).length;
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = [...evidence]
    .filter((item) => filter === 'all' || (filter === 'verified' ? Boolean(item.verifiedAt) : !item.verifiedAt))
    .filter((item) => !normalizedQuery || [item.title, item.organization, item.details, item.sourceLabel, item.sourceUrl, ...item.skills].join(' ').toLowerCase().includes(normalizedQuery))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return (
    <div className="evidence-library">
      <section className="module-stats">
        <MiniStat value={String(evidence.length)} label="Facts and records" icon="library" />
        <MiniStat value={String(verifiedCount)} label="Verified by you" icon="check" />
        <MiniStat value={String(evidence.length - verifiedCount)} label="Need a source check" icon="shield" />
      </section>
      <section className="panel module-panel evidence-panel">
        <PanelHeading eyebrow="USER-CHECKED CAREER FACTS" title="Evidence library" action="Add a record" onAction={onCreate} />
        <div className="evidence-toolbar">
          <label className="sr-only" htmlFor="career-evidence-search">Search career evidence</label>
          <div className="evidence-search"><Icon name="search" size={14} /><input id="career-evidence-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search roles, skills, projects, sources…" /></div>
          <div className="segmented-control" aria-label="Filter evidence by verification">
            <button className={filter === 'all' ? 'selected' : ''} onClick={() => setFilter('all')}>All</button>
            <button className={filter === 'verified' ? 'selected' : ''} onClick={() => setFilter('verified')}>Verified</button>
            <button className={filter === 'review' ? 'selected' : ''} onClick={() => setFilter('review')}>Needs review</button>
          </div>
        </div>
        <div className="evidence-list">
          {filtered.length ? filtered.map((item) => (
            <article className="evidence-card" key={item.id}>
              <div className="evidence-card-top">
                <span className={`evidence-kind evidence-kind-${item.kind.toLowerCase()}`}>{item.kind}</span>
                <span className={`evidence-status ${item.verifiedAt ? 'evidence-is-verified' : 'evidence-needs-review'}`}><Icon name={item.verifiedAt ? 'check' : 'clock'} size={12} />{item.verifiedAt ? 'Verified by you' : 'Needs review'}</span>
              </div>
              <h4>{item.title}</h4>
              <div className="evidence-meta">{item.organization && <span>{item.organization}</span>}{item.timeframe && <span>{item.timeframe}</span>}{item.verifiedAt && <span>Checked {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(item.verifiedAt))}</span>}</div>
              {item.details && <p className="evidence-details">{item.details}</p>}
              {item.skills.length > 0 && <div className="competency-tags">{item.skills.map((skill) => <span className="competency-pill" key={skill}>{skill}</span>)}</div>}
              <div className="evidence-card-footer">
                {item.sourceLabel || item.sourceUrl ? <span className="evidence-source"><Icon name="file" size={13} />{item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.sourceLabel || 'Open source'} <Icon name="external" size={11} /></a> : item.sourceLabel}</span> : <span className="evidence-source evidence-no-source">No source recorded</span>}
                <div><button className="text-action" onClick={() => onEdit(item)}>Edit</button><button className="text-action evidence-remove" onClick={() => { if (window.confirm(`Remove “${item.title}” from your career evidence library?`)) onDelete(item.id); }}>Remove</button></div>
              </div>
            </article>
          )) : <div className="evidence-empty"><span className="empty-icon"><Icon name={normalizedQuery || filter !== 'all' ? 'search' : 'library'} /></span><strong>{evidence.length ? 'No records match this view.' : 'Build your verified profile.'}</strong><span>{evidence.length ? 'Try another search or filter.' : 'Save facts about your experience, education, skills, projects, and achievements with a source you can check later.'}</span>{!evidence.length && <button className="button button-secondary" onClick={onCreate}><Icon name="plus" size={14} /> Add your first record</button>}</div>}
        </div>
      </section>
      <section className="module-note"><Icon name="shield" size={16} /><span>Verification is your confirmation that the source supports the record. Silverstone does not generate or independently verify these facts. Career records stay on this device until you sync them from Settings.</span></section>
    </div>
  );
}

function CareerEvidenceDialog({ current, onSave, onClose }: {
  current: CareerEvidence | null;
  onSave: (draft: { id?: string; kind: CareerEvidenceKind; title: string; organization: string; timeframe: string; details: string; skills: string[]; sourceLabel: string; sourceUrl: string; verified: boolean }) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<CareerEvidenceKind>(current?.kind ?? 'Achievement');
  const [title, setTitle] = useState(current?.title ?? '');
  const [organization, setOrganization] = useState(current?.organization ?? '');
  const [timeframe, setTimeframe] = useState(current?.timeframe ?? '');
  const [details, setDetails] = useState(current?.details ?? '');
  const [skillsText, setSkillsText] = useState(current?.skills.join(', ') ?? '');
  const [sourceLabel, setSourceLabel] = useState(current?.sourceLabel ?? '');
  const [sourceUrl, setSourceUrl] = useState(current?.sourceUrl ?? '');
  const [verified, setVerified] = useState(Boolean(current?.verifiedAt));
  const hasSource = Boolean(sourceLabel.trim() || sourceUrl.trim());

  function changed(setter: (value: string) => void, value: string) {
    setter(value);
    setVerified(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const skills = [...new Set(skillsText.split(',').map((item) => item.trim()).filter(Boolean))].slice(0, 12);
    onSave({ id: current?.id, kind, title: title.trim(), organization: organization.trim(), timeframe: timeframe.trim(), details: details.trim(), skills, sourceLabel: sourceLabel.trim(), sourceUrl: sourceUrl.trim(), verified: verified && hasSource });
  }

  return (
    <div className="modal-scrim career-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dialog-card career-dialog evidence-dialog" role="dialog" aria-modal="true" aria-labelledby="evidence-dialog-title">
        <div className="dialog-top"><span className="dialog-icon"><Icon name="library" size={18} /></span><button className="icon-button" aria-label="Close evidence editor" onClick={onClose}><Icon name="close" size={17} /></button></div>
        <span className="panel-eyebrow">CAREER · VERIFIED PROFILE</span>
        <h2 id="evidence-dialog-title">{current ? 'Update a career fact.' : 'Save a fact with its source.'}</h2>
        <p>Write a specific claim you may want to use later. Keep the wording accurate and attach a source label or link when you can.</p>
        <form onSubmit={submit}>
          <div className="career-form-grid">
            <div><label className="field-label" htmlFor="evidence-kind">Record type</label><select id="evidence-kind" value={kind} onChange={(event) => { setKind(event.target.value as CareerEvidenceKind); setVerified(false); }}>{(['Experience', 'Education', 'Skill', 'Achievement', 'Project', 'Credential'] as CareerEvidenceKind[]).map((item) => <option key={item}>{item}</option>)}</select></div>
            <div><label className="field-label" htmlFor="evidence-timeframe">Date or timeframe</label><input id="evidence-timeframe" maxLength={100} value={timeframe} onChange={(event) => changed(setTimeframe, event.target.value)} placeholder="e.g. 2023–2025 or May 2025" /></div>
          </div>
          <label className="field-label" htmlFor="evidence-title">Fact or accomplishment</label>
          <input id="evidence-title" required maxLength={160} value={title} onChange={(event) => changed(setTitle, event.target.value)} placeholder="e.g. Led the migration of the reporting service" />
          <label className="field-label" htmlFor="evidence-organization">Employer, school, or project (optional)</label>
          <input id="evidence-organization" maxLength={160} value={organization} onChange={(event) => changed(setOrganization, event.target.value)} placeholder="Where this experience took place" />
          <label className="field-label" htmlFor="evidence-details">Details and context</label>
          <textarea id="evidence-details" rows={4} maxLength={5000} value={details} onChange={(event) => changed(setDetails, event.target.value)} placeholder="Describe your role, scope, outcome, and any limitations on the claim. Use a metric only when the source supports it." />
          <label className="field-label" htmlFor="evidence-skills">Skills and keywords (comma-separated)</label>
          <input id="evidence-skills" maxLength={900} value={skillsText} onChange={(event) => changed(setSkillsText, event.target.value)} placeholder="e.g. Rust, data migration, stakeholder communication" />
          <label className="field-label" htmlFor="evidence-source-label">Source label (optional)</label>
          <input id="evidence-source-label" maxLength={300} value={sourceLabel} onChange={(event) => changed(setSourceLabel, event.target.value)} placeholder="e.g. Performance review, certificate, project repository" />
          <label className="field-label" htmlFor="evidence-source-url">Source link (optional)</label>
          <input id="evidence-source-url" type="url" maxLength={2048} value={sourceUrl} onChange={(event) => changed(setSourceUrl, event.target.value)} placeholder="https://…" />
          <label className={`evidence-verify-check ${!hasSource ? 'is-disabled' : ''}`}><input type="checkbox" checked={verified} disabled={!hasSource} onChange={(event) => setVerified(event.target.checked)} /><span><strong>I checked this record against the source above.</strong><small>{current?.verifiedAt && !verified ? 'Editing cleared the previous verification. Check the source again to mark this version verified.' : hasSource ? 'This marks the wording as reviewed by you; Silverstone does not verify it.' : 'Add a source label or link before marking this verified.'}</small></span></label>
          <div className="dialog-foot"><span><Icon name="shield" size={13} /> Saved in your local workspace</span><div className="career-editor-actions"><button className="button button-secondary" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={!title.trim() || !details.trim()}>{current ? 'Save changes' : 'Add evidence'}<Icon name="arrow" size={14} /></button></div></div>
        </form>
      </section>
    </div>
  );
}

function StarStoryDialog({ current, onSave, onClose }: {
  current: StarStory | null;
  onSave: (draft: { id?: string; title: string; competencies: string[]; situation: string; task: string; action: string; result: string; metrics: string }) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(current?.title ?? '');
  const [competenciesText, setCompetenciesText] = useState(current?.competencies.join(', ') ?? '');
  const [situation, setSituation] = useState(current?.situation ?? '');
  const [task, setTask] = useState(current?.task ?? '');
  const [action, setAction] = useState(current?.action ?? '');
  const [result, setResult] = useState(current?.result ?? '');
  const [metrics, setMetrics] = useState(current?.metrics ?? '');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const competencies = [...new Set(competenciesText.split(',').map((item) => item.trim()).filter(Boolean))].slice(0, 12);
    onSave({ id: current?.id, title: title.trim(), competencies, situation: situation.trim(), task: task.trim(), action: action.trim(), result: result.trim(), metrics: metrics.trim() });
  }

  return (
    <div className="modal-scrim career-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dialog-card career-dialog star-story-dialog" role="dialog" aria-modal="true" aria-labelledby="star-story-dialog-title">
        <div className="dialog-top"><span className="dialog-icon"><Icon name="layers" size={18} /></span><button className="icon-button" aria-label="Close STAR story editor" onClick={onClose}><Icon name="close" size={17} /></button></div>
        <span className="panel-eyebrow">CAREER · INTERVIEW STORY BANK</span>
        <h2 id="star-story-dialog-title">{current ? 'Refine this story.' : 'Save a story from your work.'}</h2>
        <p>Keep the facts grounded in your experience. Add a metric only when you can support it; the story bank stays in your local workspace.</p>
        <form onSubmit={submit}>
          <label className="field-label" htmlFor="star-story-title">Story title</label>
          <input id="star-story-title" required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Reduced checkout latency during a launch" />
          <label className="field-label" htmlFor="star-story-competencies">Skills or competencies</label>
          <input id="star-story-competencies" maxLength={400} value={competenciesText} onChange={(event) => setCompetenciesText(event.target.value)} placeholder="e.g. Ownership, debugging, collaboration" />
          <label className="field-label" htmlFor="star-story-situation">Situation · What was happening?</label>
          <textarea id="star-story-situation" rows={2} maxLength={5000} value={situation} onChange={(event) => setSituation(event.target.value)} placeholder="Give enough context to understand the challenge." />
          <label className="field-label" htmlFor="star-story-task">Task · What were you responsible for?</label>
          <textarea id="star-story-task" rows={2} maxLength={5000} value={task} onChange={(event) => setTask(event.target.value)} placeholder="State your goal, constraints, and individual responsibility." />
          <label className="field-label" htmlFor="star-story-action">Action · What did you personally do?</label>
          <textarea id="star-story-action" rows={3} maxLength={10000} value={action} onChange={(event) => setAction(event.target.value)} placeholder="Describe the decisions, steps, and collaboration you personally led." />
          <label className="field-label" htmlFor="star-story-result">Result · What changed or did you learn?</label>
          <textarea id="star-story-result" rows={2} maxLength={5000} value={result} onChange={(event) => setResult(event.target.value)} placeholder="Include a verifiable outcome, customer impact, or lesson learned." />
          <label className="field-label" htmlFor="star-story-metrics">Evidence or metrics (optional)</label>
          <input id="star-story-metrics" maxLength={1000} value={metrics} onChange={(event) => setMetrics(event.target.value)} placeholder="e.g. p95 latency down 28%, measured over two weeks" />
          <div className="dialog-foot"><span><Icon name="shield" size={13} /> Saved only in this browser</span><div className="career-editor-actions"><button className="button button-secondary" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={!title.trim()}>Save STAR story<Icon name="arrow" size={14} /></button></div></div>
        </form>
      </section>
    </div>
  );
}

function CareerOpportunityDialog({ current, onSave, onClose }: { current: CareerOpportunity | null; onSave: (draft: Omit<CareerOpportunity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void; onClose: () => void }) {
  const [kind, setKind] = useState<CareerOpportunity['kind']>(current?.kind ?? 'Job');
  const [title, setTitle] = useState(current?.title ?? '');
  const [organization, setOrganization] = useState(current?.organization ?? '');
  const [sourceUrl, setSourceUrl] = useState(current?.sourceUrl ?? '');
  const [deadline, setDeadline] = useState(current?.deadline ?? '');
  const [stage, setStage] = useState<OpportunityStage>(current?.stage ?? 'Saved');
  const [fitNotes, setFitNotes] = useState(current?.fitNotes ?? '');
  const [nextAction, setNextAction] = useState(current?.nextAction ?? '');
  const [nextActionDue, setNextActionDue] = useState(current?.nextActionDue ?? '');
  const [eligibilityItems, setEligibilityItems] = useState<EligibilityCheck[]>(current?.eligibilityItems ?? []);
  const [documents, setDocuments] = useState<ApplicationDocument[]>(current?.documents ?? []);

  function addEligibility(requirement = '') {
    setEligibilityItems((items) => [...items, { id: createId('eligibility'), requirement, status: 'To check', notes: '', sourceUrl }]);
  }

  function addDocument(name = '') {
    setDocuments((items) => [...items, { id: createId('application-document'), name, status: 'Not started', notes: '' }]);
  }

  function addSuggestedEligibility() {
    const existing = new Set(eligibilityItems.map((item) => item.requirement.toLowerCase()));
    setEligibilityItems((items) => [...items, ...scholarshipEligibilitySuggestions.filter((item) => !existing.has(item.toLowerCase())).map((requirement) => ({ id: createId('eligibility'), requirement, status: 'To check' as const, notes: '', sourceUrl }))]);
  }

  function addSuggestedDocuments() {
    const existing = new Set(documents.map((item) => item.name.toLowerCase()));
    setDocuments((items) => [...items, ...scholarshipDocumentSuggestions.filter((item) => !existing.has(item.toLowerCase())).map((name) => ({ id: createId('application-document'), name, status: 'Not started' as const, notes: '' }))]);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !organization.trim()) return;
    onSave({ id: current?.id, kind, title: title.trim(), organization: organization.trim(), sourceUrl: sourceUrl.trim(), deadline, stage, fitNotes: fitNotes.trim(), eligibilityItems: eligibilityItems.map((item) => ({ ...item, requirement: item.requirement.trim(), notes: item.notes.trim(), sourceUrl: item.sourceUrl.trim() })).filter((item) => item.requirement), documents: documents.map((item) => ({ ...item, name: item.name.trim(), notes: item.notes.trim() })).filter((item) => item.name), nextAction: nextAction.trim(), nextActionDue: nextAction.trim() ? nextActionDue : '' });
  }

  return (
    <div className="modal-scrim career-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dialog-card career-dialog" role="dialog" aria-modal="true" aria-labelledby="career-dialog-title">
        <div className="dialog-top"><span className="dialog-icon"><Icon name="briefcase" size={18} /></span><button className="icon-button" aria-label="Close opportunity editor" onClick={onClose}><Icon name="close" size={17} /></button></div>
        <span className="panel-eyebrow">LOCAL CAREER TRACKER</span><h2 id="career-dialog-title">{current?.id.startsWith('discovered-') ? 'Review this opportunity.' : current ? 'Update your next step.' : 'Save an opportunity.'}</h2><p>Keep the source, deadline, next action, and application stage together. Nothing is submitted from here.</p>
        <form onSubmit={submit}>
          <div className="career-form-grid">
            <div><label className="field-label" htmlFor="opportunity-kind">Opportunity type</label><select id="opportunity-kind" value={kind} onChange={(event) => setKind(event.target.value as CareerOpportunity['kind'])}><option>Job</option><option>Scholarship</option></select></div>
            <div><label className="field-label" htmlFor="opportunity-stage">Application stage</label><select id="opportunity-stage" value={stage} onChange={(event) => setStage(event.target.value as OpportunityStage)}>{opportunityStages.map((item) => <option key={item}>{item}</option>)}</select></div>
          </div>
          <label className="field-label" htmlFor="opportunity-title">Role or scholarship name</label><input id="opportunity-title" required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Graduate Product Designer" />
          <label className="field-label" htmlFor="opportunity-organization">Organization</label><input id="opportunity-organization" required maxLength={120} value={organization} onChange={(event) => setOrganization(event.target.value)} placeholder="Company, university, or foundation" />
          <div className="career-form-grid">
            <div><label className="field-label" htmlFor="opportunity-source">Source link</label><input id="opportunity-source" type="url" maxLength={2048} value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://…" /></div>
            <div><label className="field-label" htmlFor="opportunity-deadline">Deadline</label><input id="opportunity-deadline" type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></div>
          </div>
          <div className="career-form-grid career-next-action-fields">
            <div><label className="field-label" htmlFor="opportunity-next-action">Next action (optional)</label><input id="opportunity-next-action" maxLength={240} value={nextAction} onChange={(event) => { const value = event.target.value; setNextAction(value); if (!value.trim()) setNextActionDue(''); }} placeholder="e.g. Ask the registrar for an official transcript" /></div>
            <div><label className="field-label" htmlFor="opportunity-next-action-due">Remind me in Today</label><input id="opportunity-next-action-due" type="date" value={nextActionDue} disabled={!nextAction.trim()} onChange={(event) => setNextActionDue(event.target.value)} /><small className="field-hint">Shows as due or overdue in your local Today radar. No external notification is sent.</small></div>
          </div>
          <label className="field-label" htmlFor="opportunity-fit">Fit notes and questions to verify</label><textarea id="opportunity-fit" rows={4} maxLength={5000} value={fitNotes} onChange={(event) => setFitNotes(event.target.value)} placeholder="Why does this fit? Which eligibility details or requirements should you check?" />
          {kind === 'Scholarship' && <div className="scholarship-checklists">
            <div className="scholarship-checklist-head"><span className="panel-eyebrow">SCHOLARSHIP READINESS</span><p>Only mark a criterion after checking the official award information. Suggested prompts are examples, not confirmed requirements.</p></div>
            <section className="scholarship-checklist-section">
              <div className="scholarship-checklist-title"><div><strong>Eligibility checks</strong><small>{eligibilityItems.filter((item) => item.status !== 'To check').length} of {eligibilityItems.length} reviewed</small></div><div><button type="button" className="text-action" onClick={addSuggestedEligibility}>Add common prompts</button><button type="button" className="text-action" onClick={() => addEligibility()}>Add check</button></div></div>
              {eligibilityItems.length ? <div className="scholarship-checklist-list">{eligibilityItems.map((item) => <article className="scholarship-check-row" key={item.id}>
                <div className="scholarship-check-fields">
                  <div><label className="field-label" htmlFor={`eligibility-requirement-${item.id}`}>Requirement</label><input id={`eligibility-requirement-${item.id}`} maxLength={200} value={item.requirement} onChange={(event) => setEligibilityItems((items) => items.map((entry) => entry.id === item.id ? { ...entry, requirement: event.target.value } : entry))} placeholder="Copy the eligibility condition from the official source" /></div>
                  <div><label className="field-label" htmlFor={`eligibility-status-${item.id}`}>Your status</label><select id={`eligibility-status-${item.id}`} value={item.status} onChange={(event) => setEligibilityItems((items) => items.map((entry) => entry.id === item.id ? { ...entry, status: event.target.value as EligibilityStatus } : entry))}>{(['To check', 'Meets', 'Does not meet'] as EligibilityStatus[]).map((status) => <option key={status}>{status}</option>)}</select></div>
                </div>
                <div className="scholarship-check-fields">
                  <div><label className="field-label" htmlFor={`eligibility-notes-${item.id}`}>Notes or evidence</label><input id={`eligibility-notes-${item.id}`} maxLength={2000} value={item.notes} onChange={(event) => setEligibilityItems((items) => items.map((entry) => entry.id === item.id ? { ...entry, notes: event.target.value } : entry))} placeholder="What did you check? Any details to confirm?" /></div>
                  <div><label className="field-label" htmlFor={`eligibility-source-${item.id}`}>Source link</label><input id={`eligibility-source-${item.id}`} type="url" maxLength={2048} value={item.sourceUrl} onChange={(event) => setEligibilityItems((items) => items.map((entry) => entry.id === item.id ? { ...entry, sourceUrl: event.target.value } : entry))} placeholder="https://…" /></div>
                </div>
                <button type="button" className="text-action checklist-remove" onClick={() => setEligibilityItems((items) => items.filter((entry) => entry.id !== item.id))}>Remove check</button>
              </article>)}</div> : <p className="scholarship-check-empty">No eligibility checks yet. Add criteria from the official scholarship page or use common prompts as a starting point.</p>}
            </section>
            <section className="scholarship-checklist-section">
              <div className="scholarship-checklist-title"><div><strong>Required documents</strong><small>{documents.filter((item) => item.status === 'Ready' || item.status === 'Submitted').length} of {documents.length} ready or submitted</small></div><div><button type="button" className="text-action" onClick={addSuggestedDocuments}>Add document suggestions</button><button type="button" className="text-action" onClick={() => addDocument()}>Add document</button></div></div>
              {documents.length ? <div className="scholarship-checklist-list">{documents.map((item) => <article className="scholarship-document-row" key={item.id}>
                <div><label className="field-label" htmlFor={`application-document-name-${item.id}`}>Document</label><input id={`application-document-name-${item.id}`} maxLength={200} value={item.name} onChange={(event) => setDocuments((items) => items.map((entry) => entry.id === item.id ? { ...entry, name: event.target.value } : entry))} placeholder="Document requested by the award" /></div>
                <div><label className="field-label" htmlFor={`application-document-status-${item.id}`}>Status</label><select id={`application-document-status-${item.id}`} value={item.status} onChange={(event) => setDocuments((items) => items.map((entry) => entry.id === item.id ? { ...entry, status: event.target.value as ApplicationDocumentStatus } : entry))}>{(['Not started', 'In progress', 'Ready', 'Submitted'] as ApplicationDocumentStatus[]).map((status) => <option key={status}>{status}</option>)}</select></div>
                <div><label className="field-label" htmlFor={`application-document-notes-${item.id}`}>Notes</label><input id={`application-document-notes-${item.id}`} maxLength={2000} value={item.notes} onChange={(event) => setDocuments((items) => items.map((entry) => entry.id === item.id ? { ...entry, notes: event.target.value } : entry))} placeholder="Owner, format, or source" /></div>
                <button type="button" className="text-action checklist-remove" onClick={() => setDocuments((items) => items.filter((entry) => entry.id !== item.id))}>Remove</button>
              </article>)}</div> : <p className="scholarship-check-empty">No documents listed. Check the award page and add only the documents it requests.</p>}
            </section>
          </div>}
          <div className="dialog-foot"><span><Icon name="shield" size={13} /> Saved only in this browser</span><div className="career-editor-actions"><button className="button button-secondary" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={!title.trim() || !organization.trim()}>Save opportunity<Icon name="arrow" size={14} /></button></div></div>
        </form>
      </section>
    </div>
  );
}

function InterviewPrepDialog({
  current,
  initialOpportunityId,
  opportunities,
  onSave,
  onClose,
}: {
  current: InterviewPrep | null;
  initialOpportunityId?: string;
  opportunities: CareerOpportunity[];
  onSave: (prep: InterviewPrep) => void;
  onClose: () => void;
}) {
  const linkedOpportunity = opportunities.find((op) => op.id === (current?.opportunityId ?? initialOpportunityId));
  const [opportunityId, setOpportunityId] = useState(current?.opportunityId ?? initialOpportunityId ?? '');
  const [roleTitle, setRoleTitle] = useState(current?.roleTitle ?? linkedOpportunity?.title ?? '');
  const [company, setCompany] = useState(current?.company ?? linkedOpportunity?.organization ?? '');
  const [format, setFormat] = useState<InterviewFormat>(current?.format ?? 'Behavioral');
  const [scheduledLocal, setScheduledLocal] = useState(formatDateTimeLocal(current?.scheduledAt ?? ''));
  const [locationOrLink, setLocationOrLink] = useState(current?.locationOrLink ?? '');
  const [interviewers, setInterviewers] = useState(current?.interviewers ?? '');
  const [focusTopicsText, setFocusTopicsText] = useState(current?.focusTopics.join(', ') ?? '');
  const [jobContext, setJobContext] = useState(current?.jobContext ?? linkedOpportunity?.fitNotes ?? '');
  const [preloadQuestions, setPreloadQuestions] = useState(!current);

  function handleOpportunityChange(selectedId: string) {
    setOpportunityId(selectedId);
    if (selectedId) {
      const match = opportunities.find((op) => op.id === selectedId);
      if (match) {
        if (!roleTitle || roleTitle === linkedOpportunity?.title) setRoleTitle(match.title);
        if (!company || company === linkedOpportunity?.organization) setCompany(match.organization);
        if (!jobContext) setJobContext(match.fitNotes);
      }
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanRole = roleTitle.trim();
    const cleanCompany = company.trim();
    if (!cleanRole || !cleanCompany) return;

    const scheduledDate = scheduledLocal ? new Date(scheduledLocal) : null;
    const scheduledAt = scheduledDate && !Number.isNaN(scheduledDate.getTime()) ? scheduledDate.toISOString() : '';
    const focusTopics = focusTopicsText.split(',').map((item) => item.trim()).filter(Boolean);

    let questions = current?.questions ?? [];
    let questionsToAsk = current?.questionsToAsk ?? [];

    if (!current && preloadQuestions) {
      const templateQuestions = DEFAULT_QUESTIONS_BY_FORMAT[format] || DEFAULT_QUESTIONS_BY_FORMAT.Behavioral;
      questions = templateQuestions.map((item) => ({
        id: createId('interview-q'),
        question: item.question,
        category: item.category,
        userAnswer: '',
        score: 0,
        strengths: [],
        improvements: [],
      }));
      questionsToAsk = DEFAULT_QUESTIONS_TO_ASK[format] || DEFAULT_QUESTIONS_TO_ASK.Behavioral;
    }

    const prep: InterviewPrep = {
      id: current?.id ?? createId('interview-prep'),
      opportunityId: opportunityId || undefined,
      roleTitle: cleanRole,
      company: cleanCompany,
      format,
      scheduledAt,
      locationOrLink: locationOrLink.trim(),
      interviewers: interviewers.trim(),
      focusTopics,
      jobContext: jobContext.trim(),
      questions,
      questionsToAsk,
      preparationChecklist: current?.preparationChecklist,
      notes: current?.notes ?? '',
      readinessScore: current?.readinessScore ?? 0,
      createdAt: current?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSave(prep);
  }

  return (
    <div className="modal-scrim career-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dialog-card career-dialog" role="dialog" aria-modal="true" aria-labelledby="interview-prep-dialog-title">
        <div className="dialog-top">
          <span className="dialog-icon"><Icon name="target" size={18} /></span>
          <button className="icon-button" aria-label="Close interview setup" onClick={onClose}><Icon name="close" size={17} /></button>
        </div>
        <span className="panel-eyebrow">INTERVIEW PREPARATION & ASSESSMENT</span>
        <h2 id="interview-prep-dialog-title">{current ? 'Update interview setup.' : 'Prepare for an interview.'}</h2>
        <p>Set up the role details, format, and key competencies. You can practice and get evaluated in the assessment simulator.</p>

        <form onSubmit={submit}>
          <div className="career-form-grid">
            <div>
              <label className="field-label" htmlFor="interview-opportunity-select">Linked opportunity (optional)</label>
              <select id="interview-opportunity-select" value={opportunityId} onChange={(e) => handleOpportunityChange(e.target.value)}>
                <option value="">Standalone / Unlinked</option>
                {opportunities.map((op) => (
                  <option key={op.id} value={op.id}>{op.title} · {op.organization}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="interview-format-select">Interview type / format</label>
              <select id="interview-format-select" value={format} onChange={(e) => setFormat(e.target.value as InterviewFormat)}>
                {INTERVIEW_FORMATS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="career-form-grid">
            <div>
              <label className="field-label" htmlFor="interview-role-title">Role title</label>
              <input id="interview-role-title" required maxLength={160} value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} placeholder="e.g. Senior Backend Engineer" />
            </div>
            <div>
              <label className="field-label" htmlFor="interview-company">Company / Organization</label>
              <input id="interview-company" required maxLength={120} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Acme Tech" />
            </div>
          </div>

          <div className="career-form-grid">
            <div>
              <label className="field-label" htmlFor="interview-scheduled-at">Date & time (optional)</label>
              <input id="interview-scheduled-at" type="datetime-local" value={scheduledLocal} onChange={(e) => setScheduledLocal(e.target.value)} />
            </div>
            <div>
              <label className="field-label" htmlFor="interview-location">Platform or meeting link</label>
              <input id="interview-location" maxLength={300} value={locationOrLink} onChange={(e) => setLocationOrLink(e.target.value)} placeholder="e.g. Google Meet, Zoom, or On-site" />
            </div>
          </div>

          <label className="field-label" htmlFor="interview-interviewers">Interviewers & titles (optional)</label>
          <input id="interview-interviewers" maxLength={300} value={interviewers} onChange={(e) => setInterviewers(e.target.value)} placeholder="e.g. Sarah Miller (Engineering Director), David K (Principal Architect)" />

          <label className="field-label" htmlFor="interview-focus-topics">Focus topics & target competencies (comma-separated)</label>
          <input id="interview-focus-topics" maxLength={400} value={focusTopicsText} onChange={(e) => setFocusTopicsText(e.target.value)} placeholder="e.g. High-throughput distributed caching, Cross-functional alignment, Incident debugging" />

          <label className="field-label" htmlFor="interview-context">Job requirements excerpt / talking points</label>
          <textarea id="interview-context" rows={3} maxLength={5000} value={jobContext} onChange={(e) => setJobContext(e.target.value)} placeholder="Key responsibilities from job posting, talking points, or questions you anticipate..." />

          {!current && (
            <div style={{ marginTop: '12px' }}>
              <label className="social-channel-option" style={{ display: 'inline-flex', cursor: 'pointer' }}>
                <input type="checkbox" checked={preloadQuestions} onChange={(e) => setPreloadQuestions(e.target.checked)} />
                <span><Icon name="sparkle" size={14} /></span>
                Preload recommended mock questions and reverse-interview questions for this format
              </label>
            </div>
          )}

          <div className="dialog-foot">
            <span><Icon name="shield" size={13} /> Saved only in this browser</span>
            <div className="career-editor-actions">
              <button className="button button-secondary" type="button" onClick={onClose}>Cancel</button>
              <button className="button button-primary" type="submit" disabled={!roleTitle.trim() || !company.trim()}>
                Save setup<Icon name="arrow" size={14} />
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}

function InterviewPracticeDialog({
  prep,
  starStories,
  onAddStudyCard,
  onUseStarStory,
  onSave,
  onClose,
}: {
  prep: InterviewPrep;
  starStories: StarStory[];
  onAddStudyCard: (question: string, answer: string, topic: string) => void;
  onUseStarStory: (id: string) => void;
  onSave: (updated: InterviewPrep, showToast?: boolean) => void;
  onClose: () => void;
}) {
  const [practiceMode, setPracticeMode] = useState<'learn' | 'qa'>('learn');
  const [activeTab, setActiveTab] = useState<'questions' | 'questionsToAsk' | 'cheatsheet'>('questions');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [questions, setQuestions] = useState<InterviewAssessmentItem[]>(prep.questions);
  const [questionsToAsk, setQuestionsToAsk] = useState<string[]>(prep.questionsToAsk);
  const [notes, setNotes] = useState(prep.notes);
  const [elevatorPitch, setElevatorPitch] = useState(prep.elevatorPitch ?? '');
  const [preparationChecklist, setPreparationChecklist] = useState<InterviewPreparationChecklist>(prep.preparationChecklist ?? {
    researchedOrganization: false,
    reviewedRoleRequirements: false,
    preparedEvidenceStories: false,
    checkedLogistics: false,
    preparedQuestions: false,
  });
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newQuestionCategory, setNewQuestionCategory] = useState<InterviewAssessmentItem['category']>('behavioral');
  const [newQuestionToAsk, setNewQuestionToAsk] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState('');
  const [selectedStoryId, setSelectedStoryId] = useState('');
  const speechRecognizerRef = useRef<SpeechRecognizer | null>(null);

  const currentQ = questions[selectedIdx] ?? null;
  const wordCount = currentQ?.userAnswer.trim() ? currentQ.userAnswer.trim().split(/\s+/).length : 0;
  const estimatedSeconds = Math.round((wordCount / 135) * 60);
  const fillerAnalysis = analyzeFillerWords(currentQ?.userAnswer ?? '');
  const latestAnswerRef = useRef(currentQ?.userAnswer ?? '');

  useEffect(() => {
    latestAnswerRef.current = currentQ?.userAnswer ?? '';
  }, [currentQ?.userAnswer, selectedIdx]);

  useEffect(() => () => speechRecognizerRef.current?.stop(), []);

  const readinessScore = calculateReadiness(questions);
  const readinessClass = readinessScore >= 75 ? 'is-high' : readinessScore >= 50 ? 'is-medium' : readinessScore > 0 ? 'is-low' : 'is-empty';

  function handleAnswerChange(text: string) {
    if (!currentQ) return;
    latestAnswerRef.current = text;
    const updated = questions.map((item, index) => (index === selectedIdx
      ? { ...item, userAnswer: text, score: 0, starCoverage: undefined, strengths: [], improvements: [], suggestedPhrasing: undefined, assessedAt: undefined }
      : item));
    setQuestions(updated);
    onSave({ ...prep, questions: updated, questionsToAsk, notes, elevatorPitch, preparationChecklist, readinessScore: calculateReadiness(updated) }, false);
  }

  function toggleDictation() {
    if (isListening) {
      speechRecognizerRef.current?.stop();
      setIsListening(false);
      return;
    }
    const recognizer = createSpeechRecognizer();
    if (!recognizer) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }
    speechRecognizerRef.current = recognizer;
    recognizer.lang = 'en-US';
    recognizer.continuous = true;
    recognizer.interimResults = true;

    recognizer.onresult = (event) => {
      let finalSegment = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const item = event.results[i];
        if (item?.isFinal) {
          finalSegment += item[0].transcript + ' ';
        }
      }
      if (finalSegment && currentQ) handleAnswerChange(`${latestAnswerRef.current.trimEnd()} ${finalSegment.trim()}`.trim());
    };
    recognizer.onerror = () => setIsListening(false);
    recognizer.onend = () => setIsListening(false);

    try {
      recognizer.start();
      setIsListening(true);
    } catch {
      setIsListening(false);
    }
  }

  function handleAssess() {
    if (!currentQ || !currentQ.userAnswer.trim()) return;
    const assessment = assessInterviewAnswer(
      currentQ.question,
      currentQ.userAnswer,
      currentQ.category,
      prep.roleTitle,
      prep.company,
      `${prep.focusTopics.join(' ')} ${prep.jobContext}`
    );
    const updatedQ: InterviewAssessmentItem = {
      ...currentQ,
      score: assessment.score,
      starCoverage: assessment.starCoverage,
      strengths: assessment.strengths,
      improvements: assessment.improvements,
      suggestedPhrasing: assessment.suggestedPhrasing,
      assessedAt: new Date().toISOString(),
    };
    const updatedList = questions.map((item, index) => (index === selectedIdx ? updatedQ : item));
    setQuestions(updatedList);
    const newReadiness = calculateReadiness(updatedList);
    onSave({
      ...prep,
      questions: updatedList,
      questionsToAsk,
      notes,
      elevatorPitch,
      preparationChecklist,
      readinessScore: newReadiness,
    });
  }

  function insertStarStory() {
    const story = starStories.find((item) => item.id === selectedStoryId);
    if (!story || !currentQ) return;
    const answer = [
      `Situation: ${story.situation}`,
      `Task: ${story.task}`,
      `Action: ${story.action}`,
      `Result: ${story.result}${story.metrics ? ` ${story.metrics}` : ''}`,
    ].join('\n\n');
    handleAnswerChange(answer);
    onUseStarStory(story.id);
  }

  function togglePreparationItem(key: keyof InterviewPreparationChecklist) {
    const updated = { ...preparationChecklist, [key]: !preparationChecklist[key] };
    setPreparationChecklist(updated);
    onSave({ ...prep, questions, questionsToAsk, notes, elevatorPitch, preparationChecklist: updated, readinessScore: calculateReadiness(questions) }, false);
  }

  function addCustomQuestion(e: FormEvent) {
    e.preventDefault();
    if (!newQuestionText.trim()) return;
    const item: InterviewAssessmentItem = {
      id: createId('interview-q'),
      question: newQuestionText.trim(),
      category: newQuestionCategory,
      userAnswer: '',
      score: 0,
      strengths: [],
      improvements: [],
    };
    const updated = [...questions, item];
    setQuestions(updated);
    setSelectedIdx(updated.length - 1);
    setNewQuestionText('');
    onSave({ ...prep, questions: updated });
  }

  function deleteQuestion(indexToDelete: number) {
    const updated = questions.filter((_, i) => i !== indexToDelete);
    setQuestions(updated);
    const nextIdx = Math.max(0, Math.min(selectedIdx, updated.length - 1));
    setSelectedIdx(nextIdx);
    onSave({ ...prep, questions: updated, readinessScore: calculateReadiness(updated) });
  }

  function addQuestionToAsk(e: FormEvent) {
    e.preventDefault();
    if (!newQuestionToAsk.trim()) return;
    const updated = [...questionsToAsk, newQuestionToAsk.trim()];
    setQuestionsToAsk(updated);
    setNewQuestionToAsk('');
    onSave({ ...prep, questionsToAsk: updated });
  }

  function deleteQuestionToAsk(indexToDelete: number) {
    const updated = questionsToAsk.filter((_, i) => i !== indexToDelete);
    setQuestionsToAsk(updated);
    onSave({ ...prep, questionsToAsk: updated });
  }

  const generatedThankYou = `Subject: Thank you — ${prep.roleTitle} interview (${prep.company})

Dear ${prep.interviewers || 'Hiring Team'},

Thank you very much for taking the time to speak with me today about the ${prep.roleTitle} role at ${prep.company}. I thoroughly enjoyed our conversation and learning more about the team's direction${prep.focusTopics.length ? ` and focus on ${prep.focusTopics.join(', ')}` : ''}.

Our discussion reinforced my enthusiasm for joining ${prep.company}. I am confident that my experience and structured approach will allow me to deliver immediate value to the team.

Please let me know if you need any further information or work references. I look forward to hearing about next steps!

Warm regards,
[Your Name]`;

  async function copyThankYou() {
    try {
      await navigator.clipboard.writeText(generatedThankYou);
      setCopyFeedback('Thank-you note copied to clipboard!');
      setTimeout(() => setCopyFeedback(''), 3000);
    } catch {
      setCopyFeedback('Could not access clipboard.');
    }
  }

  return (
    <div className="modal-scrim career-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="dialog-card practice-dialog" role="dialog" aria-modal="true" aria-labelledby="interview-practice-title">
        <div className="practice-dialog-header">
          <div className="practice-header-titles">
            <small style={{ color: '#8c94a4', fontFamily: 'DM Mono, monospace', fontSize: '8px', letterSpacing: '.5px' }}>
              {prep.company} · {prep.format}
            </small>
            <h2 id="interview-practice-title">{prep.roleTitle} Interview Practice</h2>
            <p>Learn a structure for this interview, then practice aloud or in writing. Answer feedback uses a local rubric, not an AI hiring prediction.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className={`readiness-gauge ${readinessClass}`}>
              {readinessScore > 0 ? `${readinessScore}% Readiness` : 'Not Assessed'}
            </span>
            <button className="icon-button" aria-label="Close interview practice" onClick={onClose}>
              <Icon name="close" size={17} />
            </button>
          </div>
        </div>

        <div className="practice-mode-switch" role="group" aria-label="Interview preparation mode">
          <button type="button" aria-pressed={practiceMode === 'learn'} className={practiceMode === 'learn' ? 'is-active' : ''} onClick={() => setPracticeMode('learn')}><Icon name="book" size={14} /> Learn mode</button>
          <button type="button" aria-pressed={practiceMode === 'qa'} className={practiceMode === 'qa' ? 'is-active' : ''} onClick={() => setPracticeMode('qa')}><Icon name="mic" size={14} /> Q&amp;A mode <span>{questions.length} prompts</span></button>
        </div>

        {practiceMode === 'learn' ? <InterviewLearnMode prep={prep} starStories={starStories} onStart={() => setPracticeMode('qa')} /> : <>
        <div className="practice-tabs">
          <button
            type="button"
            className={`practice-tab-btn ${activeTab === 'questions' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('questions')}
          >
            <Icon name="file" size={14} /> Mock Questions ({questions.length})
          </button>
          <button
            type="button"
            className={`practice-tab-btn ${activeTab === 'questionsToAsk' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('questionsToAsk')}
          >
            <Icon name="target" size={14} /> Questions to Ask ({questionsToAsk.length})
          </button>
          <button
            type="button"
            className={`practice-tab-btn ${activeTab === 'cheatsheet' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('cheatsheet')}
          >
            <Icon name="sparkles" size={14} /> Cheat Sheet & Thank-You Note
          </button>
        </div>

        <div className="practice-body">
          {activeTab === 'questions' && (
            <>
              <div className="question-nav">
                {questions.map((q, idx) => (
                  <button
                    key={q.id}
                    type="button"
                    className={`question-step-btn ${idx === selectedIdx ? 'is-active' : ''}`}
                    onClick={() => setSelectedIdx(idx)}
                  >
                    <span>Q{idx + 1}</span>
                    {q.score > 0 ? <span className="step-score">{q.score}%</span> : null}
                  </button>
                ))}
              </div>

              {currentQ ? (
                <>
                  <div className="current-question-box">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <small>{currentQ.category} Question · Q{selectedIdx + 1} of {questions.length}</small>
                      {questions.length > 1 && (
                        <button
                          className="icon-button"
                          style={{ width: '22px', height: '22px' }}
                          title="Delete this question"
                          onClick={() => deleteQuestion(selectedIdx)}
                        >
                          <Icon name="close" size={13} />
                        </button>
                      )}
                    </div>
                    <strong>{currentQ.question}</strong>
                  </div>

                  <div className="answer-input-area">
                    <div className="answer-toolbar">
                      <button
                        type="button"
                        className={`dictate-btn ${isListening ? 'is-listening' : ''}`}
                        onClick={toggleDictation}
                      >
                        <Icon name="mic" size={13} /> {isListening ? 'Listening... click to stop' : 'Dictate answer'}
                      </button>
                      <span style={{ color: 'var(--muted)', fontSize: '9px', fontFamily: 'DM Mono, monospace' }}>
                        {wordCount} words · ~{estimatedSeconds}s spoken pace
                      </span>
                    </div>

                    {starStories.length > 0 && (
                      <div className="practice-story-insert">
                        <label className="field-label" htmlFor="practice-star-story">Use a saved STAR story as a starting point</label>
                        <div>
                          <select id="practice-star-story" value={selectedStoryId} onChange={(event) => setSelectedStoryId(event.target.value)}>
                            <option value="">Choose a story…</option>
                            {starStories.map((story) => <option key={story.id} value={story.id}>{story.title}</option>)}
                          </select>
                          <button className="button button-secondary" type="button" onClick={insertStarStory} disabled={!selectedStoryId}>Insert into answer</button>
                        </div>
                      </div>
                    )}

                    <textarea
                      rows={6}
                      value={currentQ.userAnswer}
                      onChange={(e) => handleAnswerChange(e.target.value)}
                      placeholder="Type or dictate your answer here. For behavioral questions, structure with Situation (context), Task (goal), Action (what you did), and Result (quantifiable impact)..."
                    />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                      <span style={{ fontSize: '9px', color: 'var(--muted)' }}><Icon name="shield" size={12} /> Answers autosave locally · rubric runs here</span>
                      <div className="practice-answer-actions">
                        <button type="button" className="button button-secondary" onClick={() => onAddStudyCard(currentQ.question, currentQ.userAnswer, `${prep.roleTitle} interview`)} disabled={!currentQ.userAnswer.trim()}><Icon name="book" size={14} /> Save to Study</button>
                        <button type="button" className="button button-primary" onClick={handleAssess} disabled={!currentQ.userAnswer.trim()}><Icon name="sparkle" size={14} /> Assess my answer</button>
                      </div>
                    </div>
                    <div className="practice-speech-note"><span className={`filler-badge ${fillerAnalysis.total ? 'has-fillers' : 'is-clean'}`}>{fillerAnalysis.total} filler word{fillerAnalysis.total === 1 ? '' : 's'} detected</span><span>Browser dictation may use your browser’s speech service; Silverstone does not save raw audio.</span></div>
                  </div>

                  {currentQ.score > 0 && (
                    <div className="assessment-result-panel">
                      <div className="assessment-score-header">
                        <div>
                          <span className="score-badge-large">
                            {currentQ.score}
                            <small>/ 100</small>
                          </span>
                          <span style={{ marginLeft: '10px', fontSize: '10px', fontWeight: 600, color: currentQ.score >= 75 ? '#2e7d58' : currentQ.score >= 50 ? '#9c6c1b' : '#a44d4d' }}>
                            {currentQ.score >= 75 ? 'Strong Answer' : currentQ.score >= 50 ? 'Solid Foundation' : 'Needs Polish'}
                          </span>
                        </div>
                        {currentQ.starCoverage && (
                          <div className="star-indicators">
                            <span className={`star-indicator-pill ${currentQ.starCoverage.situation ? 'is-covered' : ''}`}>
                              {currentQ.starCoverage.situation ? '✓' : '○'} Situation
                            </span>
                            <span className={`star-indicator-pill ${currentQ.starCoverage.task ? 'is-covered' : ''}`}>
                              {currentQ.starCoverage.task ? '✓' : '○'} Task
                            </span>
                            <span className={`star-indicator-pill ${currentQ.starCoverage.action ? 'is-covered' : ''}`}>
                              {currentQ.starCoverage.action ? '✓' : '○'} Action
                            </span>
                            <span className={`star-indicator-pill ${currentQ.starCoverage.result ? 'is-covered' : ''}`}>
                              {currentQ.starCoverage.result ? '✓' : '○'} Result
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="assessment-columns">
                        <div className="assessment-col col-strengths">
                          <h4><Icon name="check" size={13} /> Identified Strengths</h4>
                          <ul>
                            {currentQ.strengths.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="assessment-col col-improvements">
                          <h4><Icon name="target" size={13} /> Areas to Elevate</h4>
                          <ul>
                            {currentQ.improvements.length ? (
                              currentQ.improvements.map((imp, i) => <li key={i}>{imp}</li>)
                            ) : (
                              <li>Great coverage! Keep delivery crisp and natural.</li>
                            )}
                          </ul>
                        </div>
                      </div>

                      {currentQ.suggestedPhrasing && (
                        <div className="suggested-phrasing-card">
                          <strong>RECOMMENDED POLISH / BRIDGE</strong>
                          <p>{currentQ.suggestedPhrasing}</p>
                        </div>
                      )}
                    </div>
                  )}

                  <details style={{ marginTop: '10px', fontSize: '10px', color: 'var(--muted)' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 600 }}>+ Add another mock question to this interview</summary>
                    <form onSubmit={addCustomQuestion} style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                      <input
                        style={{ flex: 1 }}
                        value={newQuestionText}
                        onChange={(e) => setNewQuestionText(e.target.value)}
                        placeholder="Type a custom interview question..."
                      />
                      <select
                        style={{ width: '130px' }}
                        value={newQuestionCategory}
                        onChange={(e) => setNewQuestionCategory(e.target.value as InterviewAssessmentItem['category'])}
                      >
                        <option value="behavioral">Behavioral</option>
                        <option value="technical">Technical</option>
                        <option value="situational">Situational</option>
                        <option value="leadership">Leadership</option>
                      </select>
                      <button className="button button-secondary" type="submit" disabled={!newQuestionText.trim()}>Add</button>
                    </form>
                  </details>
                </>
              ) : (
                <div className="empty-state">
                  <p>No questions remaining.</p>
                  <button className="button button-secondary" onClick={() => setSelectedIdx(0)}>Reset view</button>
                </div>
              )}
            </>
          )}

          {activeTab === 'questionsToAsk' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <strong style={{ fontSize: '12px', color: 'var(--ink)' }}>Questions to Ask the Interviewer</strong>
                <p style={{ fontSize: '9px', color: 'var(--muted)', margin: '3px 0 10px' }}>
                  Reverse-interviewing shows deep professional preparation and uncovers whether the team culture fits you.
                </p>
              </div>

              <div className="reverse-qa-list">
                {questionsToAsk.map((q, idx) => (
                  <div className="reverse-qa-item" key={idx}>
                    <Icon name="sparkle" size={14} style={{ color: '#686ed7', flexShrink: 0, marginTop: '2px' }} />
                    <span style={{ flex: 1, fontSize: '10px', lineHeight: 1.5 }}>{q}</span>
                    <button
                      className="icon-button"
                      style={{ width: '20px', height: '20px' }}
                      title="Remove question"
                      onClick={() => deleteQuestionToAsk(idx)}
                    >
                      <Icon name="close" size={12} />
                    </button>
                  </div>
                ))}
              </div>

              <form onSubmit={addQuestionToAsk} style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <input
                  style={{ flex: 1 }}
                  value={newQuestionToAsk}
                  onChange={(e) => setNewQuestionToAsk(e.target.value)}
                  placeholder="Add a custom question to ask the interviewer..."
                />
                <button className="button button-secondary" type="submit" disabled={!newQuestionToAsk.trim()}>
                  <Icon name="plus" size={13} /> Add question
                </button>
              </form>
            </div>
          )}

          {activeTab === 'cheatsheet' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="interview-checklist">
                <div><strong>Before the interview</strong><small>A short checklist to close the gaps beyond question practice.</small></div>
                {([
                  ['researchedOrganization', `Review ${prep.company} and its recent work`],
                  ['reviewedRoleRequirements', 'Re-read the role requirements and choose relevant examples'],
                  ['preparedEvidenceStories', 'Prepare evidence-backed stories from your STAR bank'],
                  ['checkedLogistics', 'Check the meeting link, location, time, and interviewer names'],
                  ['preparedQuestions', 'Choose questions to ask the interview team'],
                ] as const).map(([key, label]) => <label className="interview-check-item" key={key}><input type="checkbox" checked={preparationChecklist[key]} onChange={() => togglePreparationItem(key)} /><span>{label}</span></label>)}
              </div>
              <div>
                <strong style={{ fontSize: '12px', color: 'var(--ink)' }}>60-Second Elevator Pitch ("Tell Me About Yourself")</strong>
                <p style={{ fontSize: '9px', color: 'var(--muted)', margin: '3px 0 8px' }}>
                  Keep your opening intro under 90 seconds: Current role + Top achievement + Why this specific opportunity.
                </p>
                <textarea
                  rows={3}
                  maxLength={5000}
                  value={elevatorPitch}
                  onChange={(e) => {
                    const value = e.target.value;
                    setElevatorPitch(value);
                    onSave({ ...prep, questions, questionsToAsk, notes, elevatorPitch: value, preparationChecklist, readinessScore: calculateReadiness(questions) }, false);
                  }}
                  placeholder="e.g. For the past 4 years I've specialized in high-performance distributed systems, recently scaling our checkout service to 45k QPS. I'm excited about Acme because..."
                />
              </div>

              <div className="thank-you-box">
                <div className="thank-you-header">
                  <div>
                    <strong style={{ fontSize: '11px', color: 'var(--ink)' }}>One-Click Post-Interview Thank-You Email</strong>
                    <p style={{ fontSize: '8px', color: 'var(--muted)', margin: '2px 0 0' }}>
                      Send within 24 hours to reaffirm interest, cite a key topic discussed, and stay memorable.
                    </p>
                  </div>
                  <button className="button button-secondary" onClick={copyThankYou}>
                    <Icon name="sparkles" size={13} /> {copyFeedback || 'Copy email note'}
                  </button>
                </div>
                <pre className="thank-you-text">{generatedThankYou}</pre>
              </div>

              <div>
                <strong style={{ fontSize: '12px', color: 'var(--ink)' }}>Post-Interview Debrief Notes</strong>
                <p style={{ fontSize: '9px', color: 'var(--muted)', margin: '3px 0 8px' }}>
                  Record what went well, unexpected technical questions asked, and areas to follow up on.
                </p>
                <textarea
                  rows={4}
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    onSave({ ...prep, questions, questionsToAsk, notes: e.target.value, elevatorPitch, preparationChecklist, readinessScore: calculateReadiness(questions) }, false);
                  }}
                  placeholder="Record immediate impressions right after hanging up..."
                />
              </div>
            </div>
          )}
        </div>
        </>}
      </section>
    </div>
  );
}

function InterviewLearnMode({ prep, starStories, onStart }: { prep: InterviewPrep; starStories: StarStory[]; onStart: () => void }) {
  const lessons: Record<InterviewPrep['format'], { title: string; intro: string; steps: string[] }> = {
    Screening: {
      title: 'Make your first 90 seconds easy to follow.',
      intro: 'Connect your recent work to this role, then leave room for a conversation. Keep logistics and compensation answers direct and factual.',
      steps: ['Present: summarize your current focus and strengths.', 'Proof: choose one relevant achievement and state your contribution.', 'Fit: explain what interests you about this role, using a detail from the posting.', 'Pause: stop after about a minute and invite the next question.'],
    },
    Technical: {
      title: 'Show how you reason, not just the result.',
      intro: 'Make your thinking audible. Clarify what is being asked, state assumptions, and use examples that match the role’s tools and constraints.',
      steps: ['Clarify inputs, constraints, and edge cases.', 'Outline an approach before diving into details.', 'Explain tradeoffs and why you chose this path.', 'Check correctness with examples, tests, and failure cases.'],
    },
    Behavioral: {
      title: 'Use STAR to make one real example concrete.',
      intro: 'Keep context brief and spend most of your time on your own decisions and actions. Describe outcomes accurately, including what you learned.',
      steps: ['Situation: set the relevant context in one or two sentences.', 'Task: state the goal and your responsibility.', 'Action: explain what you personally did and why.', 'Result: share the supported outcome, metric, or lesson.'],
    },
    'System Design': {
      title: 'Build the design together, one layer at a time.',
      intro: 'A strong design answer is collaborative. Ask what matters most, describe a simple baseline, and make scale and reliability tradeoffs explicit.',
      steps: ['Clarify functional needs, traffic, latency, and availability.', 'Sketch APIs, data flows, and the main components.', 'Follow one request through the system and identify bottlenecks.', 'Discuss failure handling, security, observability, and tradeoffs.'],
    },
    'Hiring Manager': {
      title: 'Connect ownership and outcomes to the team’s needs.',
      intro: 'Use examples that show how you set direction, work with others, and deliver. Be specific about the scope you owned and what you would need to learn.',
      steps: ['Describe the outcome you were accountable for.', 'Show how you aligned people and handled disagreement.', 'Explain how you measured progress and adjusted.', 'Ask about success measures, team priorities, and the first 90 days.'],
    },
    'Case Study': {
      title: 'Make the problem-solving path visible.',
      intro: 'Resist jumping to a solution. Structure the question, state assumptions, and use evidence or metrics to compare options.',
      steps: ['Restate the objective and clarify what success means.', 'Break the problem into a few useful parts.', 'State assumptions and identify the evidence you would seek.', 'Compare options, recommend one, and name risks or next steps.'],
    },
  };
  const lesson = lessons[prep.format];

  return (
    <div className="interview-learn-body">
      <section className="interview-learn-hero">
        <div><span className="panel-eyebrow">LEARN · {prep.format.toUpperCase()}</span><h3>{lesson.title}</h3><p>{lesson.intro}</p></div>
        <div className="learn-role-context"><Icon name="target" size={14} /><span><strong>{prep.roleTitle}</strong><small>{prep.company}</small></span></div>
      </section>
      <div className="interview-learning-grid">
        <section className="interview-learning-card">
          <span className="learning-card-index">01 / ANSWER FRAME</span>
          <h4>A practical structure</h4>
          <ol>{lesson.steps.map((step) => <li key={step}>{step}</li>)}</ol>
        </section>
        <section className="interview-learning-card">
          <span className="learning-card-index">02 / YOUR MATERIAL</span>
          <h4>Bring your own evidence</h4>
          {prep.focusTopics.length ? <><p className="learning-muted">Focus topics saved for this interview:</p><div className="competency-tags">{prep.focusTopics.map((topic) => <span className="competency-pill" key={topic}>{topic}</span>)}</div></> : <p className="learning-muted">Add focus topics in interview setup to tailor your practice.</p>}
          <div className="learning-story-count"><Icon name="layers" size={15} /><span><strong>{starStories.length} STAR {starStories.length === 1 ? 'story' : 'stories'} saved</strong><small>{starStories.length ? starStories.slice(0, 3).map((story) => story.title).join(' · ') : 'Build a story in the Career module to use as a practice starting point.'}</small></span></div>
        </section>
        <section className="interview-learning-card learning-context-card">
          <span className="learning-card-index">03 / ROLE CONTEXT</span><h4>Use the job details</h4>
          {prep.jobContext.trim() ? <p>{prep.jobContext}</p> : <p className="learning-muted">Add a role description or talking points in interview setup. Tie examples to the actual responsibilities rather than guessing what the interviewer wants.</p>}
        </section>
      </div>
      <div className="interview-learn-footer"><span><Icon name="shield" size={13} /> This guide is saved in the app; assessment stays local and is not an AI hiring score.</span><button className="button button-primary" onClick={onStart}>Start Q&amp;A practice <Icon name="arrow" size={14} /></button></div>
    </div>
  );
}

function PortfolioModule({ projects, onCreate, onEdit }: { projects: PortfolioProject[]; onCreate: () => void; onEdit: (project: PortfolioProject) => void }) {
  return (
    <div className="module-layout">
      <section className="portfolio-banner"><div><span className="panel-eyebrow">A PORTFOLIO THAT GROWS WITH YOU</span><h2>Turn the process<br />into the story.</h2><p>Draft a case study, keep earlier versions, and review it before you publish.</p><button className="button button-light" onClick={onCreate}><Icon name="plus" size={15} /> Create a project</button></div><div className="portfolio-art"><span className="portfolio-art-card art-back" /><span className="portfolio-art-card art-mid" /><span className="portfolio-art-card art-front"><Icon name="layers" size={22} /><small>PROJECT / 01</small><b>Field notes<br />for better work.</b></span><span className="portfolio-orb" /></div></section>
      <section className="module-cards portfolio-projects">{projects.length ? projects.map((project, index) => <ProjectCard key={project.id} initials={String(index + 1).padStart(2, '0')} name={project.title} type={project.summary || `${project.versions.length} saved version${project.versions.length === 1 ? '' : 's'}`} status="LOCAL DRAFT" tone={['blue', 'violet', 'green', 'amber'][index % 4]} onClick={() => onEdit(project)} />) : <div className="portfolio-empty"><span className="empty-icon"><Icon name="layers" /></span><strong>No project drafts yet.</strong><span>Start with a project title and a few notes. Your drafts stay in this browser.</span><button className="button button-secondary" onClick={onCreate}><Icon name="plus" size={15} /> Create your first project</button></div>}</section>
      <section className="module-note"><Icon name="shield" size={16} /><span>Portfolio changes will be previewed and reviewed before anything is published.</span></section>
    </div>
  );
}

function ProjectCard({ initials, name, type, status, tone, onClick }: { initials: string; name: string; type: string; status: string; tone: string; onClick: () => void }) {
  return <button className="project-card" onClick={onClick}><span className={`project-art project-art-${tone}`}><b>{initials}</b><i /><i /><i /></span><span className="project-card-body"><small>{status}</small><strong>{name}</strong><span>{type}</span><span className="project-open">Edit draft <Icon name="arrow" size={14} /></span></span></button>;
}

function PortfolioProjectDialog({ current, onSave, onClose }: { current: PortfolioProject | null; onSave: (draft: { id?: string; title: string; summary: string; content: string }) => void; onClose: () => void }) {
  const [title, setTitle] = useState(current?.title ?? '');
  const [summary, setSummary] = useState(current?.summary ?? '');
  const [content, setContent] = useState(current?.content ?? '');
  const [preview, setPreview] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    onSave({ id: current?.id, title: cleanTitle, summary: summary.trim(), content: content.trim() });
  }

  function loadVersion(version: PortfolioProject['versions'][number]) {
    setTitle(version.title);
    setSummary(version.summary);
    setContent(version.content);
    setPreview(true);
  }

  return (
    <div className="modal-scrim portfolio-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dialog-card portfolio-dialog" role="dialog" aria-modal="true" aria-labelledby="portfolio-dialog-title">
        <div className="dialog-top"><span className="dialog-icon"><Icon name="layers" size={18} /></span><button className="icon-button" aria-label="Close project editor" onClick={onClose}><Icon name="close" size={17} /></button></div>
        <span className="panel-eyebrow">LOCAL PORTFOLIO DRAFT</span><h2 id="portfolio-dialog-title">{current ? 'Shape this project story.' : 'Start with the work.'}</h2><p>Keep a clear, evidence-backed draft. Silverstone does not publish it.</p>
        <form onSubmit={submit}>
          <label className="field-label" htmlFor="portfolio-title">Project title</label>
          <input id="portfolio-title" required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. A clearer onboarding flow" />
          <label className="field-label" htmlFor="portfolio-summary">Short summary</label>
          <textarea id="portfolio-summary" rows={2} maxLength={320} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="What changed, who it helped, and why it mattered?" />
          <div className="portfolio-content-heading">{preview ? <span className="field-label">Case study notes</span> : <label className="field-label" htmlFor="portfolio-content">Case study notes</label>}<button className="text-action" type="button" onClick={() => setPreview((value) => !value)}>{preview ? 'Edit notes' : 'Preview'}<Icon name={preview ? 'file' : 'external'} size={13} /></button></div>
          {preview ? <article className="portfolio-preview"><span className="panel-eyebrow">DRAFT PREVIEW · MARKDOWN TEXT</span><h3>{title || 'Untitled project'}</h3>{summary && <p>{summary}</p>}<pre>{content || 'Your project notes will appear here.'}</pre></article> : <textarea id="portfolio-content" rows={10} maxLength={25000} value={content} onChange={(event) => setContent(event.target.value)} placeholder={'## Context\nWho was this for, and what needed to change?\n\n## Approach\nWhat did you explore, make, or learn?\n\n## Outcome\nWhat changed? Add evidence when you have it.'} />}
          {current && <details className="portfolio-history"><summary>Version history · {current.versions.length} saved version{current.versions.length === 1 ? '' : 's'}</summary>{current.versions.length ? <ul>{current.versions.map((version) => <li key={version.id}><span><strong>{version.title}</strong><small>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(version.savedAt))}</small></span><button className="text-action" type="button" onClick={() => loadVersion(version)}>Restore to editor<Icon name="arrow" size={13} /></button></li>)}</ul> : <p>No earlier versions yet. Saving a change creates a version to return to.</p>}</details>}
          <div className="dialog-foot"><span><Icon name="shield" size={13} /> Stored locally · never published here</span><div className="portfolio-editor-actions"><button className="button button-secondary" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={!title.trim()}>Save draft<Icon name="arrow" size={14} /></button></div></div>
        </form>
      </section>
    </div>
  );
}

function formatDateTimeLocal(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function StudioModule({ posts, onCreate, onEdit }: { posts: SocialPostDraft[]; onCreate: () => void; onEdit: (post: SocialPostDraft) => void }) {
  const plannedPosts = posts.filter((post) => post.plannedFor);
  const draftPosts = posts.filter((post) => !post.plannedFor);
  const channelsUsed = new Set(posts.flatMap((post) => post.channels)).size;
  const sortedPosts = [...posts].sort((left, right) => {
    if (!left.plannedFor && !right.plannedFor) return right.updatedAt.localeCompare(left.updatedAt);
    if (!left.plannedFor) return 1;
    if (!right.plannedFor) return -1;
    return left.plannedFor.localeCompare(right.plannedFor);
  });

  return (
    <div className="module-layout">
      <section className="module-hero studio-module-hero"><div><span className="panel-eyebrow">CREATOR STUDIO</span><h2>One idea.<br />Thoughtfully adapted.</h2><p>Write a post, choose its channels, and plan when you want to review it.</p><button className="button button-primary" onClick={onCreate}><Icon name="plus" size={15} /> Start a draft</button></div><div className="studio-orbit"><div className="studio-orbit-core"><Icon name="sparkles" size={24} /></div><span className="studio-node node-one">f</span><span className="studio-node node-two">x</span><span className="studio-node node-three">ig</span><span className="studio-node node-four">f</span></div></section>
      <section className="module-stats"><MiniStat value={String(draftPosts.length)} label="Unplanned drafts" icon="file" /><MiniStat value={String(plannedPosts.length)} label="Planned locally" icon="calendar" /><MiniStat value={String(channelsUsed)} label="Channels in use" icon="sparkles" /></section>
      <section className="panel module-panel"><PanelHeading eyebrow="LOCAL POST PLANNER" title="Drafts & planned times" action="New post" onAction={onCreate} />{sortedPosts.length ? <div className="draft-list">{sortedPosts.map((post, index) => <DraftRow key={post.id} post={post} tone={['blue', 'violet', 'amber'][index % 3]} onClick={() => onEdit(post)} />)}</div> : <div className="empty-state"><span className="empty-icon"><Icon name="sparkles" /></span><strong>A quiet space for your next post.</strong><span>Draft one idea, select Facebook, Instagram, or X, and add an optional review time.</span><button className="button button-secondary" onClick={onCreate}><Icon name="plus" size={15} /> Create a post draft</button></div>}</section>
      <section className="module-note"><Icon name="shield" size={16} /><span>Drafts and planned times stay in this browser. No account is connected and nothing is scheduled or published externally.</span></section>
    </div>
  );
}

function DraftRow({ post, tone, onClick }: { post: SocialPostDraft; tone: string; onClick: () => void }) {
  const plannedLabel = post.plannedFor ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(post.plannedFor)).toUpperCase() : 'DRAFT';
  const status = post.plannedFor ? 'Planned locally' : 'Draft';
  return <button className="draft-row draft-row-button" onClick={onClick}><span className={`draft-date draft-${tone}`}>{plannedLabel}</span><span className="draft-copy"><small>{post.channels.join(' · ')}</small><strong>{post.title}</strong><span>{post.body}</span></span><span className="draft-status"><i className={post.plannedFor ? 'draft-status-planned' : ''} />{status}</span><Icon name="chevron" size={15} /></button>;
}

function SocialPostDialog({ current, onSave, onClose }: { current: SocialPostDraft | null; onSave: (draft: { id?: string; title: string; body: string; channels: SocialChannel[]; plannedFor: string; timezone: string }) => void; onClose: () => void }) {
  const [title, setTitle] = useState(current?.title ?? '');
  const [body, setBody] = useState(current?.body ?? '');
  const [channels, setChannels] = useState<SocialChannel[]>(current?.channels ?? []);
  const [plannedLocal, setPlannedLocal] = useState(formatDateTimeLocal(current?.plannedFor ?? ''));
  const [preview, setPreview] = useState(false);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  function toggleChannel(channel: SocialChannel) {
    setChannels((selected) => selected.includes(channel) ? selected.filter((item) => item !== channel) : [...selected, channel]);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    const cleanBody = body.trim();
    if (!cleanTitle || !cleanBody || channels.length === 0) return;
    const plannedDate = plannedLocal ? new Date(plannedLocal) : null;
    if (plannedDate && Number.isNaN(plannedDate.getTime())) return;
    onSave({ id: current?.id, title: cleanTitle, body: cleanBody, channels, plannedFor: plannedDate?.toISOString() ?? '', timezone: timeZone });
  }

  return (
    <div className="modal-scrim social-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dialog-card social-dialog" role="dialog" aria-modal="true" aria-labelledby="social-dialog-title">
        <div className="dialog-top"><span className="dialog-icon"><Icon name="sparkles" size={18} /></span><button className="icon-button" aria-label="Close social post editor" onClick={onClose}><Icon name="close" size={17} /></button></div>
        <span className="panel-eyebrow">LOCAL SOCIAL DRAFT</span><h2 id="social-dialog-title">{current ? 'Shape this post.' : 'Start with one idea.'}</h2><p>Choose channels and an optional local review time. Silverstone will not publish or schedule it with a service.</p>
        <form onSubmit={submit}>
          <label className="field-label" htmlFor="social-title">Draft name</label><input id="social-title" required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. What I learned this week" />
          <fieldset className="social-channel-fieldset"><legend className="field-label">Channels</legend><div className="social-channel-options">{socialChannels.map((channel) => <label className={`social-channel-option ${channels.includes(channel) ? 'is-selected' : ''}`} key={channel}><input type="checkbox" checked={channels.includes(channel)} onChange={() => toggleChannel(channel)} /><span>{channel === 'X' ? '𝕏' : channel === 'Instagram' ? '◎' : 'f'}</span>{channel}</label>)}</div></fieldset>
          <div className="social-content-heading"><label className="field-label" htmlFor="social-body">Post text</label><button className="text-action" type="button" onClick={() => setPreview((value) => !value)}>{preview ? 'Edit post' : 'Preview'}<Icon name={preview ? 'file' : 'external'} size={13} /></button></div>
          {preview ? <article className="social-post-preview"><span className="social-preview-channels">{channels.join(' · ') || 'Choose a channel'}</span><strong>{title || 'Untitled post'}</strong><p>{body || 'Your post text will appear here.'}</p></article> : <textarea id="social-body" required rows={8} maxLength={5000} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a thoughtful post. Keep platform-specific edits for a later review." />}
          <label className="field-label" htmlFor="social-planned-for">Plan a review time <span>(optional)</span></label><input id="social-planned-for" type="datetime-local" value={plannedLocal} onChange={(event) => setPlannedLocal(event.target.value)} />
          <div className="dialog-foot"><span><Icon name="shield" size={13} /> Stored locally · timezone {timeZone}</span><div className="social-editor-actions"><button className="button button-secondary" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={!title.trim() || !body.trim() || channels.length === 0}>Save draft<Icon name="arrow" size={14} /></button></div></div>
        </form>
      </section>
    </div>
  );
}

function suggestEmailCategory(subject: string, body: string): { category: EmailTriageCategory; reason: string } {
  const text = `${subject} ${body}`.toLowerCase();
  if (/\b(scholarship|fellowship|financial aid|grant|tuition award)\b/.test(text)) return { category: 'Scholarship', reason: 'matched scholarship or funding terms' };
  if (/\b(interview|recruiter|job application|hiring|offer letter|resume|résumé)\b/.test(text)) return { category: 'Career', reason: 'matched job search or interview terms' };
  if (/\b(project|team|meeting|workstream|colleague|client|deliverable)\b/.test(text)) return { category: 'Work', reason: 'matched work-related terms' };
  if (/\b(family|friend|personal|birthday|dinner|weekend)\b/.test(text)) return { category: 'Personal', reason: 'matched personal terms' };
  return { category: 'Other', reason: 'no category keywords matched' };
}

type EmailReplyStarter = 'acknowledge' | 'clarify' | 'update' | 'decline';

function createEmailReplyStarter(subject: string, starter: EmailReplyStarter): string {
  const topic = subject.trim() ? ` regarding “${subject.trim()}”` : '';
  const endings: Record<EmailReplyStarter, string> = {
    acknowledge: `Thank you for your message${topic}. I’ve received the details and will [next step] by [date].`,
    clarify: `Thank you for your message${topic}. Could you please clarify [specific question or detail]? That will help me respond accurately.`,
    update: `I’m writing with a brief update${topic}: [add the verified status]. I expect to [next step] by [date].`,
    decline: `Thank you for considering me${topic}. After reviewing the details, I won’t be able to proceed at this time. I appreciate your understanding.`,
  };
  return `Hello,\n\n${endings[starter]}\n\nBest,\n[Your name]`;
}

function EmailDesk({ emails, onCreate, onEdit, onDelete, onToast }: { emails: EmailItem[]; onCreate: () => void; onEdit: (email: EmailItem) => void; onDelete: (id: string) => void; onToast: (message: string) => void }) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | EmailStatus>('All');
  const [categoryFilter, setCategoryFilter] = useState<'All' | EmailTriageCategory>('All');
  const today = localDateKey();
  const needsReply = emails.filter((email) => email.status === 'Needs reply').length;
  const draftReady = emails.filter((email) => email.status === 'Draft ready').length;
  const followUpsDue = emails.filter((email) => email.followUpDue && email.followUpDue <= today && !['Done', 'Archived'].includes(email.status)).length;
  const needle = query.trim().toLowerCase();
  const filtered = [...emails]
    .filter((email) => statusFilter === 'All' || email.status === statusFilter)
    .filter((email) => categoryFilter === 'All' || email.category === categoryFilter)
    .filter((email) => !needle || [email.sender, email.subject, email.body, email.replyDraft].join(' ').toLowerCase().includes(needle))
    .sort((left, right) => (right.receivedAt || right.createdAt).localeCompare(left.receivedAt || left.createdAt));

  async function copyReply(email: EmailItem) {
    if (!email.replyDraft.trim()) return;
    try {
      await navigator.clipboard.writeText(email.replyDraft);
      onToast('Reply draft copied. Review it before using it.');
    } catch {
      onToast('Clipboard access is unavailable in this browser.');
    }
  }

  return (
    <div className="module-layout email-desk-layout">
      <section className="module-stats">
        <MiniStat value={String(needsReply)} label="Needs a reply" icon="inbox" />
        <MiniStat value={String(draftReady)} label="Drafts ready to review" icon="file" />
        <MiniStat value={String(followUpsDue)} label="Follow-ups due" icon="calendar" />
      </section>
      <section className="panel module-panel email-desk-panel">
        <PanelHeading eyebrow="MANUAL EMAIL TRIAGE" title="Your local inbox" action="Add email" onAction={onCreate} />
        <div className="email-desk-toolbar">
          <label className="sr-only" htmlFor="email-desk-search">Search local emails</label>
          <div className="evidence-search"><Icon name="search" size={14} /><input id="email-desk-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sender, subject, message, or draft…" /></div>
          <label><span className="sr-only">Filter by status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'All' | EmailStatus)}><option>All</option>{(['Needs reply', 'Draft ready', 'Waiting', 'Done', 'Archived'] as EmailStatus[]).map((status) => <option key={status}>{status}</option>)}</select></label>
          <label><span className="sr-only">Filter by category</span><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as 'All' | EmailTriageCategory)}><option>All</option>{(['Career', 'Scholarship', 'Work', 'Personal', 'Other'] as EmailTriageCategory[]).map((category) => <option key={category}>{category}</option>)}</select></label>
        </div>
        <div className="email-card-list">
          {filtered.length ? filtered.map((email) => (
            <article className={`email-card email-priority-${email.priority.toLowerCase()}`} key={email.id}>
              <div className="email-card-top"><span className="email-category-pill">{email.category}</span><span className={`email-priority-pill email-priority-pill-${email.priority.toLowerCase()}`}>{email.priority} priority</span><span className={`email-status-pill email-status-${email.status.toLowerCase().replaceAll(' ', '-')}`}>{email.status}</span></div>
              <h3>{email.subject}</h3>
              <div className="email-card-meta"><span>{email.sender}</span><span>{email.receivedAt ? formatDeadline(email.receivedAt) : 'Date not recorded'}</span>{email.followUpDue && <span className={email.followUpDue < today && !['Done', 'Archived'].includes(email.status) ? 'email-overdue' : ''}>Follow up {email.followUpDue < today ? 'overdue' : 'by'} {formatDeadline(email.followUpDue)}</span>}</div>
              <details className="email-message-details"><summary>Review original message</summary><p>{email.body}</p></details>
              {email.replyDraft.trim() ? <div className="email-reply-preview"><small>LOCAL REPLY DRAFT</small><pre>{email.replyDraft}</pre></div> : <p className="email-no-draft">No reply draft yet.</p>}
              <div className="email-card-actions"><button className="button button-secondary" onClick={() => onEdit(email)}><Icon name="more" size={14} /> Review / edit</button><button className="button button-secondary" onClick={() => void copyReply(email)} disabled={!email.replyDraft.trim()}><Icon name="file" size={14} /> Copy draft</button><button className="text-action email-remove" onClick={() => { if (window.confirm(`Remove “${email.subject}” from the local inbox?`)) onDelete(email.id); }}>Remove</button></div>
            </article>
          )) : <div className="email-desk-empty"><span className="empty-icon"><Icon name={emails.length ? 'search' : 'inbox'} /></span><strong>{emails.length ? 'No emails match these filters.' : 'No emails saved here yet.'}</strong><span>{emails.length ? 'Try another search or filter.' : 'Paste a selected message when you want help organizing it or preparing a reply.'}</span>{!emails.length && <button className="button button-secondary" onClick={onCreate}><Icon name="plus" size={14} /> Add a message</button>}</div>}
        </div>
      </section>
      <section className="module-note email-privacy-note"><Icon name="shield" size={16} /><span>Selected messages and reply drafts stay in this browser and are excluded from cloud sync. Browser storage and backups are not encrypted. This inbox is not connected to an email account; Silverstone never sends these drafts.</span></section>
    </div>
  );
}

function EmailDialog({ current, onSave, onClose }: { current: EmailItem | null; onSave: (draft: Omit<EmailItem, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void; onClose: () => void }) {
  const [sender, setSender] = useState(current?.sender ?? '');
  const [subject, setSubject] = useState(current?.subject ?? '');
  const [body, setBody] = useState(current?.body ?? '');
  const [receivedAt, setReceivedAt] = useState(current?.receivedAt ?? localDateKey());
  const [category, setCategory] = useState<EmailTriageCategory>(current?.category ?? 'Other');
  const [priority, setPriority] = useState<EmailPriority>(current?.priority ?? 'Normal');
  const [status, setStatus] = useState<EmailStatus>(current?.status ?? 'Needs reply');
  const [followUpDue, setFollowUpDue] = useState(current?.followUpDue ?? '');
  const [replyDraft, setReplyDraft] = useState(current?.replyDraft ?? '');
  const [replyStarter, setReplyStarter] = useState<EmailReplyStarter>('acknowledge');
  const categoryHint = suggestEmailCategory(subject, body);

  function insertReplyStarter() {
    if (replyDraft.trim() && !window.confirm('Replace the current reply draft with this starter?')) return;
    setReplyDraft(createEmailReplyStarter(subject, replyStarter));
    setStatus('Draft ready');
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sender.trim() || !subject.trim() || !body.trim()) return;
    onSave({ id: current?.id, sender: sender.trim(), subject: subject.trim(), body: body.trim(), receivedAt, category, priority, status, followUpDue, replyDraft: replyDraft.trim() });
  }

  return (
    <div className="modal-scrim career-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dialog-card career-dialog email-dialog" role="dialog" aria-modal="true" aria-labelledby="email-dialog-title">
        <div className="dialog-top"><span className="dialog-icon"><Icon name="inbox" size={18} /></span><button className="icon-button" aria-label="Close email editor" onClick={onClose}><Icon name="close" size={17} /></button></div>
        <span className="panel-eyebrow">LOCAL INBOX · MANUAL REVIEW</span><h2 id="email-dialog-title">{current ? 'Review this email.' : 'Add a selected email.'}</h2><p>Paste only the message content you want to work with. No email account is connected, and this does not send anything.</p>
        <form onSubmit={submit}>
          <div className="career-form-grid"><div><label className="field-label" htmlFor="email-sender">Sender name or address</label><input id="email-sender" required maxLength={250} value={sender} onChange={(event) => setSender(event.target.value)} placeholder="Who sent the message?" /></div><div><label className="field-label" htmlFor="email-subject">Subject</label><input id="email-subject" required maxLength={500} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Email subject" /></div></div>
          <div className="career-form-grid"><div><label className="field-label" htmlFor="email-received-at">Received date (optional)</label><input id="email-received-at" type="date" value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} /></div><div><label className="field-label" htmlFor="email-follow-up">Follow-up date (optional)</label><input id="email-follow-up" type="date" value={followUpDue} onChange={(event) => setFollowUpDue(event.target.value)} /></div></div>
          <div className="career-form-grid email-triage-fields"><div><label className="field-label" htmlFor="email-category">Category</label><select id="email-category" value={category} onChange={(event) => setCategory(event.target.value as EmailTriageCategory)}>{(['Career', 'Scholarship', 'Work', 'Personal', 'Other'] as EmailTriageCategory[]).map((item) => <option key={item}>{item}</option>)}</select></div><div><label className="field-label" htmlFor="email-priority">Priority</label><select id="email-priority" value={priority} onChange={(event) => setPriority(event.target.value as EmailPriority)}>{(['High', 'Normal', 'Low'] as EmailPriority[]).map((item) => <option key={item}>{item}</option>)}</select></div><div><label className="field-label" htmlFor="email-status">Triage status</label><select id="email-status" value={status} onChange={(event) => setStatus(event.target.value as EmailStatus)}>{(['Needs reply', 'Draft ready', 'Waiting', 'Done', 'Archived'] as EmailStatus[]).map((item) => <option key={item}>{item}</option>)}</select></div></div>
          <div className="email-keyword-hint"><span><Icon name="sparkle" size={14} /><span><strong>Local keyword hint: {categoryHint.category}</strong><small>{categoryHint.reason}. This simple rule may be wrong; check it yourself.</small></span></span><button type="button" className="text-action" onClick={() => setCategory(categoryHint.category)}>Use hint</button></div>
          <label className="field-label" htmlFor="email-message-body">Selected message text</label><textarea id="email-message-body" required rows={8} maxLength={8000} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Paste the email text you want to review…" />
          <div className="email-reply-tools"><div><label className="field-label" htmlFor="email-reply-starter">Reply starter</label><select id="email-reply-starter" value={replyStarter} onChange={(event) => setReplyStarter(event.target.value as EmailReplyStarter)}><option value="acknowledge">Acknowledge</option><option value="clarify">Ask for clarification</option><option value="update">Share an update</option><option value="decline">Decline politely</option></select></div><button type="button" className="button button-secondary" onClick={insertReplyStarter}>Insert starter</button></div>
          <label className="field-label" htmlFor="email-reply-draft">Reply draft</label><textarea id="email-reply-draft" rows={7} maxLength={8000} value={replyDraft} onChange={(event) => setReplyDraft(event.target.value)} placeholder="Write or edit your reply. Check names, dates, claims, and attachments before using it." />
          <p className="email-review-hint">Reply starters are fixed local templates, not AI-generated answers. Review every detail before copying a draft into your mail app.</p>
          <div className="dialog-foot"><span><Icon name="shield" size={13} /> Local only · never sent</span><div className="career-editor-actions"><button className="button button-secondary" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={!sender.trim() || !subject.trim() || !body.trim()}>{current ? 'Save changes' : 'Save email'}<Icon name="arrow" size={14} /></button></div></div>
        </form>
      </section>
    </div>
  );
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
  const localEvents = [...state.captures].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 8).map((capture) => ({
    time: new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(capture.createdAt)),
    title: `${capture.kind} captured`,
    detail: `${capture.text} · ${capture.modality} · local`,
    tone: 'green',
  }));
  return (
    <div className="module-layout activity-layout">
      <section className="module-stats"><MiniStat value={`${state.tasks.length}`} label="Tasks in this browser" icon="check" /><MiniStat value={`${state.captures.length}`} label="Local captures" icon="file" /><MiniStat value="0" label="Connected services" icon="shield" /></section>
      <section className="panel module-panel"><PanelHeading eyebrow="LOCAL CAPTURE HISTORY" title="Recent captures" />
        <div className="activity-timeline">{localEvents.length ? localEvents.map((event, index) => <div className="activity-row" key={`${event.title}-${event.time}-${index}`}><span className="activity-time">{event.time}</span><span className={`activity-marker activity-${event.tone}`}><i /></span><span className="activity-copy"><strong>{event.title}</strong><small>{event.detail}</small></span></div>) : <div className="empty-state compact"><span className="empty-icon"><Icon name="file" /></span><strong>No captures yet.</strong><span>Your notes and ideas will appear here after you save them.</span></div>}</div>
      </section>
      <div className="module-note"><Icon name="shield" size={16} /><span>This view lists local captures only. Task edits and external action history are not recorded here yet.</span></div>
    </div>
  );
}

function CloudWorkspacePanel({ workspace, onRestore }: { workspace: LocalAppState; onRestore: (workspace: LocalAppState) => Promise<void> }) {
  const [user, setUser] = useState<User | null>(null);
  const [cloudClient, setCloudClient] = useState<SupabaseClient | null>(null);
  const [cloudApi, setCloudApi] = useState<typeof import('./cloud') | null>(null);
  const [email, setEmail] = useState('');
  const [snapshot, setSnapshot] = useState<CloudWorkspaceSnapshot | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [apiReadiness, setApiReadiness] = useState<ApiReadinessResponse | null | undefined>(undefined);
  const [apiError, setApiError] = useState('');

  async function inspectApi() {
    setApiReadiness(undefined);
    setApiError('');
    try {
      setApiReadiness(await getApiReadiness());
    } catch (reason) {
      setApiError(reason instanceof Error ? reason.message : 'The Silverstone API could not be reached.');
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void getApiReadiness(controller.signal).then(setApiReadiness).catch((reason: unknown) => {
      if (!controller.signal.aborted) setApiError(reason instanceof Error ? reason.message : 'The Silverstone API could not be reached.');
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let active = true;
    if (supabaseConfigured) {
      void Promise.all([import('./supabase'), import('./cloud')]).then(([clientModule, api]) => {
        if (!active) return;
        setCloudClient(clientModule.supabase);
        setCloudApi(api);
      }).catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Could not load Supabase support.');
      });
    }
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const client = cloudClient;
    const api = cloudApi;
    if (!client || !api) return undefined;
    let active = true;
    const fetchSnapshot = () => {
      void api.loadCloudWorkspace().then((nextSnapshot) => {
        if (active) setSnapshot(nextSnapshot);
      }).catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Could not read the cloud workspace.');
      });
    };
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      if (nextUser) window.setTimeout(fetchSnapshot, 0);
      else setSnapshot(undefined);
    });
    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) setError(sessionError.message);
      const currentUser = data.session?.user ?? null;
      setUser(currentUser);
      if (currentUser) fetchSnapshot();
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [cloudClient, cloudApi]);

  async function sendSignInLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = cloudClient;
    if (!client) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { error: signInError } = await client.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin, shouldCreateUser: false },
      });
      if (signInError) throw signInError;
      setMessage('Check your email for a sign-in link. It will return you to this site.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not send a sign-in link.');
    } finally {
      setBusy(false);
    }
  }

  async function signInWithPasskey() {
    const client = cloudClient;
    if (!client) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { error: passkeyError } = await client.auth.signInWithPasskey();
      if (passkeyError) throw passkeyError;
      setMessage('Signed in with your passkey.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Passkey sign-in was not completed.');
    } finally {
      setBusy(false);
    }
  }

  async function registerPasskey() {
    const client = cloudClient;
    if (!client) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { error: registerError } = await client.auth.registerPasskey();
      if (registerError) throw registerError;
      setMessage('Passkey registered for this account on this device.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not register this passkey.');
    } finally {
      setBusy(false);
    }
  }

  async function refreshCloud() {
    if (!cloudApi) return;
    setBusy(true);
    setError('');
    try {
      setSnapshot(await cloudApi.loadCloudWorkspace());
      setMessage('Cloud workspace refreshed.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not refresh the cloud workspace.');
    } finally {
      setBusy(false);
    }
  }

  async function uploadLocalWorkspace() {
    if (!snapshot || !cloudApi) return;
    const prompt = snapshot.source === 'records'
      ? 'Replace the entire online record set from this device? This also removes online records deleted on this device. Email, application, portfolio, and social drafts remain local.'
      : snapshot.source === 'legacy'
        ? 'Write this device’s non-draft records into the new per-record cloud store? This does not merge other changes from the older JSON copy. Device-only drafts stay here, and the old copy’s draft collections will be cleared.'
        : 'Create your first per-record online set from this device? Email, application, portfolio, and social drafts stay local.';
    if (!window.confirm(prompt)) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const onlineWorkspace: LocalAppState = {
        ...workspace,
        portfolioProjects: [],
        socialPosts: [],
        emailItems: [],
        careerDrafts: [],
      };
      await cloudApi.saveCloudWorkspace(onlineWorkspace, snapshot.revision);
      setSnapshot(await cloudApi.loadCloudWorkspace());
      setMessage('Per-record cloud set saved. Device-only drafts were excluded.');
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : 'Could not save to Supabase.';
      setError(detail);
      if (detail.includes('changed since they were loaded')) {
        try { setSnapshot(await cloudApi.loadCloudWorkspace()); } catch { /* Keep the conflict message visible. */ }
      }
    } finally {
      setBusy(false);
    }
  }

  async function restoreCloudCopy() {
    if (!snapshot?.workspace) return;
    if (!window.confirm('Restore online workspace records from Supabase? Email, application, portfolio, and social drafts on this device will be kept and will not be replaced.')) return;
    setBusy(true);
    setError('');
    try {
      await onRestore(snapshot.workspace);
      setMessage('Cloud records restored to this device.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not restore the cloud copy.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    const client = cloudClient;
    if (!client) return;
    setBusy(true);
    setError('');
    try {
      const { error: signOutError } = await client.auth.signOut();
      if (signOutError) throw signOutError;
      setSnapshot(undefined);
      setMessage('Signed out. This device’s local workspace remains available.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not sign out.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel settings-panel cloud-panel">
      <PanelHeading eyebrow="SUPABASE ONLINE WORKSPACE" title="Keep account records available online" />
      <div className="cloud-info-card cloud-api-status">
        <span className="local-data-icon"><Icon name="sparkle" size={16} /></span>
        <span><strong>Silverstone AI service</strong><small>{apiError || (apiReadiness === undefined ? 'Checking the Rust API…' : apiReadiness === null ? 'Not connected. Set VITE_SILVERSTONE_API_URL in Vercel after deploying the API.' : `${apiReadiness.status === 'ready' ? 'Ready' : 'Reachable with missing configuration'} · Supabase Auth ${apiReadiness.features.supabase_auth ? 'on' : 'off'} · OpenAI ${apiReadiness.features.openai_responses ? 'on' : 'off'} · v${apiReadiness.version}`)}</small></span>
        <button className="text-action" onClick={() => void inspectApi()} disabled={apiReadiness === undefined}>Check service</button>
      </div>
      {!supabaseConfigured ? <div className="cloud-not-configured"><span className="connection-lock"><Icon name="cloud" size={18} /></span><p>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> to your local environment and Vercel project settings, then redeploy.</p></div> : user ? <>
        <div className="cloud-user-row"><span><strong>{user.email ?? 'Signed-in account'}</strong><small>Signed in · device-only drafts are kept separate</small></span><button className="text-action" onClick={signOut} disabled={busy}>Sign out</button></div>
        <div className="cloud-info-card"><span className="local-data-icon"><Icon name="shield" size={16} /></span><span><strong>Private per-record cloud data</strong><small>Sync is currently user-triggered and replaces the account’s online record set atomically. Drafts stay on this device; automatic background sync and cross-device conflict resolution are still to come.</small></span></div>
        {snapshot === undefined ? <p className="cloud-state-copy">Checking your Supabase records…</p> : <div className="cloud-snapshot-row"><span><strong>{snapshot.source === 'records' ? 'Per-record cloud data found' : snapshot.source === 'legacy' ? 'Older cloud copy detected' : 'No cloud records yet'}</strong><small>{snapshot.source === 'records' ? `Revision ${snapshot.revision}${snapshot.updatedAt ? ` · synced ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(snapshot.updatedAt))}` : ''}` : snapshot.source === 'legacy' ? 'Save this device’s records to move them into the new schema.' : 'Create the first record set from this device.'}</small></span><button className="button button-secondary" onClick={refreshCloud} disabled={busy}><Icon name="reset" size={14} /> Refresh</button></div>}
        <div className="cloud-actions"><button className="button button-primary" onClick={uploadLocalWorkspace} disabled={busy || snapshot === undefined}><Icon name="cloud" size={15} /> {snapshot?.source === 'records' ? 'Replace cloud records' : snapshot?.source === 'legacy' ? 'Save records to new store' : 'Create cloud records'}</button>{snapshot?.workspace && <button className="button button-secondary" onClick={restoreCloudCopy} disabled={busy}><Icon name="download" size={14} /> Restore to this device</button>}<button className="button button-secondary" onClick={registerPasskey} disabled={busy}><Icon name="shield" size={14} /> Add a passkey</button></div>
        <p className="cloud-passkey-note">Passkeys use your device’s biometric, PIN, or security key. Supabase stores the public credential; it does not receive your fingerprint or face data.</p>
      </> : <>
        <div className="cloud-not-configured cloud-auth-intro"><span className="connection-lock"><Icon name="shield" size={18} /></span><p>Sign in to access your private cloud records. First sign in with an existing account, then you can register a device passkey for future sign-ins.</p></div>
        <button className="button button-primary cloud-passkey-signin" onClick={signInWithPasskey} disabled={busy || !cloudClient}><Icon name="shield" size={15} /> Sign in with a passkey</button>
        <form className="cloud-email-form" onSubmit={sendSignInLink}><label className="field-label" htmlFor="cloud-signin-email">Or use your account email</label><div><input id="cloud-signin-email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /><button className="button button-secondary" type="submit" disabled={busy || !cloudClient || !email.trim()}>Email sign-in link</button></div></form>
      </>}
      {error && <p className="cloud-feedback cloud-error" role="alert">{error}</p>}
      {message && <p className="cloud-feedback cloud-success" role="status">{message}</p>}
      <small className="cloud-footer-note">Apply Supabase migrations 001, 002, and 003 before using record sync. Local changes do not reach the cloud until you choose a sync action.</small>
    </section>
  );
}

function SettingsPage({ state, theme, onThemeChange, onImport, onRestoreCloud, onReset, onToast }: {
  state: LocalAppState;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onImport: (serializedBackup: string) => Promise<void>;
  onRestoreCloud: (workspace: LocalAppState) => Promise<void>;
  onReset: () => void;
  onToast: (message: string) => void;
}) {
  const importInputRef = useRef<HTMLInputElement | null>(null);

  function exportBackup() {
    const blob = new Blob([createWorkspaceBackup(state)], { type: 'application/json' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `silverstone-backup-${localDateKey()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    onToast('Backup downloaded. Keep the unencrypted file somewhere safe.');
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('This backup is larger than the 10 MB import limit.');
      const serializedBackup = await file.text();
      parseWorkspaceBackup(serializedBackup);
      if (!window.confirm('Restore this backup and replace the tasks, notes, study progress, recall cards, interview preparations and answers, STAR story bank, career evidence records and linked application drafts, portfolio drafts, career opportunities and scholarship checklists, email messages and reply drafts, and social post drafts currently stored in this browser?')) return;
      await onImport(serializedBackup);
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Could not restore this backup.');
    } finally {
      input.value = '';
    }
  }

  return (
    <>
      <div className="page-heading module-heading"><div><div className="eyebrow-line"><span className="eyebrow-dot" /> YOUR CONTROLS</div><h1>Make this space yours.</h1><p>Preferences and privacy controls for this device.</p></div></div>
      <div className="settings-layout">
        <section className="panel settings-panel"><PanelHeading eyebrow="APPEARANCE" title="A comfortable workspace" /><div className="setting-row"><span className="setting-symbol"><Icon name={theme === 'light' ? 'sun' : 'moon'} size={18} /></span><span className="setting-copy"><strong>Color theme</strong><small>Choose the look that works for you.</small></span><div className="segmented-control"><button className={theme === 'light' ? 'selected' : ''} onClick={() => onThemeChange('light')}><Icon name="sun" size={14} /> Light</button><button className={theme === 'dark' ? 'selected' : ''} onClick={() => onThemeChange('dark')}><Icon name="moon" size={14} /> Dark</button></div></div></section>
        <section className="panel settings-panel"><PanelHeading eyebrow="LOCAL DATA" title="This browser only" /><div className="local-data-card"><span className="local-data-icon"><Icon name="shield" size={18} /></span><span><strong>Your current preview data stays on this device.</strong><small>Tasks, captures, study goals, recall cards, interview preparations and answers, STAR stories, career evidence and application drafts, portfolio drafts, career opportunities, social drafts, email messages and reply drafts, and theme preferences use browser storage, which is not an encrypted vault. Keep highly sensitive documents and account details out of this preview.</small></span></div><div className="setting-row setting-row-danger"><span className="setting-symbol danger-symbol"><Icon name="reset" size={18} /></span><span className="setting-copy"><strong>Clear local workspace</strong><small>Remove tasks, captures, study progress, interview preparations and answers, STAR stories, career evidence and application drafts, recall cards, portfolio drafts, career opportunities and scholarship checklists, email messages and reply drafts, and social drafts from this browser.</small></span><button className="button button-danger" onClick={() => { if (window.confirm('Clear all tasks, captures, study progress, interview preparations and answers, STAR stories, career evidence and application drafts, recall cards, portfolio drafts, career opportunities and scholarship checklists, email messages and reply drafts, and social drafts stored in this browser?')) onReset(); }}>Clear data</button></div></section>
        <section className="panel settings-panel"><PanelHeading eyebrow="BACKUP & RESTORE" title="Keep a portable copy" /><div className="backup-summary"><span className="backup-summary-icon"><Icon name="download" size={18} /></span><div><strong>Export or restore this workspace</strong><p>The backup includes tasks, notes, study goals and sessions, recall cards with review intervals, interview preparations and answers, the STAR story bank, career evidence and evidence-linked application drafts, portfolio drafts with saved versions, career opportunities and scholarship checklists, email messages and reply drafts, and social post drafts. It is an unencrypted JSON file saved by your browser; Silverstone does not upload it automatically.</p></div></div><div className="backup-actions"><button className="button button-secondary" onClick={exportBackup}><Icon name="download" size={15} /> Download backup</button><button className="button button-secondary" onClick={() => importInputRef.current?.click()}><Icon name="file" size={15} /> Restore backup</button><input ref={importInputRef} className="backup-file-input" type="file" accept=".json,application/json" aria-label="Choose a Silverstone backup file" onChange={importBackup} /></div></section>
        <CloudWorkspacePanel workspace={state} onRestore={onRestoreCloud} />
        <section className="panel settings-panel"><PanelHeading eyebrow="APP CONNECTIONS" title="External services" /><div className="empty-connection"><span className="connection-lock"><Icon name="shield" size={19} /></span><p>Mail, calendar, social, brokerage, and device access are not active in this shell.</p><button className="text-action" onClick={() => onToast('Connection setup will be added after the permission service')}>Connection roadmap <Icon name="arrow" size={14} /></button></div></section>
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

function StudyCardDialog({ current, defaultTopic, onSave, onClose }: { current: StudyCard | null; defaultTopic: string; onSave: (draft: { id?: string; topic: string; question: string; answer: string }) => void; onClose: () => void }) {
  const [topic, setTopic] = useState(current?.topic ?? defaultTopic);
  const [question, setQuestion] = useState(current?.question ?? '');
  const [answer, setAnswer] = useState(current?.answer ?? '');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!question.trim() || !answer.trim()) return;
    onSave({ id: current?.id, topic: topic.trim(), question: question.trim(), answer: answer.trim() });
  }

  return (
    <div className="modal-scrim study-card-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dialog-card study-card-dialog" role="dialog" aria-modal="true" aria-labelledby="study-card-dialog-title">
        <div className="dialog-top"><span className="dialog-icon"><Icon name="book" size={18} /></span><button className="icon-button" aria-label="Close recall card editor" onClick={onClose}><Icon name="close" size={17} /></button></div>
        <span className="panel-eyebrow">LOCAL ACTIVE RECALL</span><h2 id="study-card-dialog-title">{current ? 'Improve this recall card.' : 'Make a question worth remembering.'}</h2><p>{current ? 'Changing a card resets its review interval so you can learn the updated version.' : 'New cards enter your review queue right away. They stay on this device.'}</p>
        <form onSubmit={submit}>
          <label className="field-label" htmlFor="study-card-topic">Topic</label><input id="study-card-topic" maxLength={120} value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="e.g. Rust ownership" />
          <label className="field-label" htmlFor="study-card-question">Question</label><textarea id="study-card-question" required rows={3} maxLength={1000} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What do you want to be able to recall without looking?" />
          <label className="field-label" htmlFor="study-card-answer">Answer</label><textarea id="study-card-answer" required rows={5} maxLength={10000} value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Write a concise explanation, steps, or key details." />
          <div className="dialog-foot"><span><Icon name="shield" size={13} /> Stored locally · no AI generation</span><div className="study-card-actions"><button className="button button-secondary" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={!question.trim() || !answer.trim()}>{current ? 'Save changes' : 'Add card'}<Icon name="arrow" size={14} /></button></div></div>
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

function SearchDialog({ tasks, captures, emails, onClose, onNavigate }: { tasks: AgentTask[]; captures: CaptureItem[]; emails: EmailItem[]; onClose: () => void; onNavigate: (page: PageKey) => void }) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    const taskResults = tasks.filter((task) => task.title.toLowerCase().includes(normalized)).map((task) => ({ id: task.id, title: task.title, detail: `${task.category} task`, page: 'today' as PageKey }));
    const captureResults = captures.filter((capture) => capture.text.toLowerCase().includes(normalized)).map((capture) => ({ id: capture.id, title: capture.text, detail: 'Local note', page: 'library' as PageKey }));
    const emailResults = emails.filter((email) => [email.sender, email.subject, email.body, email.replyDraft].join(' ').toLowerCase().includes(normalized)).map((email) => ({ id: email.id, title: email.subject, detail: `Email · ${email.sender}`, page: 'inbox' as PageKey }));
    return [...taskResults, ...captureResults, ...emailResults].slice(0, 6);
  }, [captures, emails, query, tasks]);

  return (
    <div className="modal-scrim search-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="search-dialog" role="dialog" aria-modal="true" aria-label="Search local workspace">
        <div className="search-dialog-input"><Icon name="search" size={18} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks, notes, and local emails…" /><kbd>ESC</kbd><button className="icon-button" aria-label="Close search" onClick={onClose}><Icon name="close" size={16} /></button></div>
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
  const [thinking, setThinking] = useState(false);
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

  async function handleMessage(rawText: string) {
    const text = rawText.trim();
    if (!text || thinking) return;
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

    setThinking(true);
    try {
      const response = await askSilverstone(text);
      setMessages((current) => [...current, { id: createId('turn'), role: 'silverstone', text: response.answer }]);
      speakReply(response.answer);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Cloud AI could not answer this message.');
    } finally {
      setThinking(false);
    }
  }

  function startListening() {
    if (thinking) return;
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
      if (transcript) void handleMessage(transcript);
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
    void handleMessage(draft);
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
          <span className={`voice-state ${listening ? 'voice-state-listening' : speaking ? 'voice-state-speaking' : ''}`}><i />{listening ? 'Listening to you' : speaking ? 'Speaking reply' : thinking ? 'Thinking with cloud AI' : 'Ready when you are'}</span>
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
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={1} maxLength={4000} disabled={thinking} placeholder="Ask or tell Silverstone something…" aria-label="Type a message to Silverstone" />
          <button type="button" className={`voice-mic-button ${listening ? 'is-listening' : ''}`} onClick={startListening} disabled={thinking} aria-label={listening ? 'Stop listening' : 'Start voice input'} title={listening ? 'Stop listening' : 'Start voice input'}>
            {listening ? <span className="mic-stop-square" /> : <Icon name="mic" size={18} />}
          </button>
          <button className="voice-send-button" type="submit" disabled={!draft.trim() || thinking} aria-label="Send message"><Icon name={thinking ? 'sparkles' : 'send'} size={17} /></button>
        </form>

        <footer className="voice-footer">
          <span><Icon name="shield" size={13} /> Silverstone saves no audio or chat. AI questions send only submitted text to OpenAI; provider data handling still applies. Your browser speech service may process voice input.</span>
          {visibleVoices.length > 0 && <label className="voice-choice"><span>Voice</span><select value={voiceName} onChange={(event) => setVoiceName(event.target.value)} aria-label="Choose spoken voice"><option value="">Device default</option>{visibleVoices.map((voice) => <option value={voice.name} key={`${voice.name}-${voice.lang}`}>{voice.name}</option>)}</select></label>}
        </footer>
        <div className="voice-processing-note">Speech recognition depends on your browser and may need an internet connection. Local task and note commands stay on this device; other questions use cloud AI and require sign-in.</div>
      </section>
    </div>
  );
}

export default App;
