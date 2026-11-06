import type { AgentTask, ApplicationDocument, ApplicationDocumentStatus, CareerDraft, CareerDraftKind, CareerEvidence, CareerEvidenceKind, CareerOpportunity, CaptureItem, EligibilityCheck, EligibilityStatus, EmailItem, EmailPriority, EmailStatus, EmailTriageCategory, InterviewAssessmentItem, InterviewFormat, InterviewPrep, LocalAppState, OpportunityStage, PortfolioProject, PortfolioProjectVersion, SocialChannel, SocialPostDraft, StarStory, StudyCard, StudyGoal, StudySession } from './types';

const DATABASE_NAME = 'silverstone-local';
const DATABASE_VERSION = 1;
const OBJECT_STORE = 'records';
const WORKSPACE_KEY = 'workspace';
const LEGACY_STORAGE_KEYS = ['silverstone.local.v2', 'silverstone.local.v1', 'orbit.local.v1'];
const FALLBACK_MODE_KEY = 'silverstone.storage-fallback.v1';

export function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

interface WorkspaceRecord {
  key: string;
  state: unknown;
}

interface WorkspaceBackup {
  format: 'silverstone-workspace-backup';
  version: 1;
  exportedAt: string;
  state: LocalAppState;
}

let databasePromise: Promise<IDBDatabase> | null = null;
let activeStorageBackend: 'indexeddb' | 'localstorage' = 'indexeddb';

export function createInitialState(): LocalAppState {
  return {
    version: 13,
    tasks: [],
    captures: [],
    studyGoal: null,
    studySessions: [],
    portfolioProjects: [],
    careerOpportunities: [],
    socialPosts: [],
    studyCards: [],
    interviewPreps: [],
    starStories: [],
    careerEvidence: [],
    emailItems: [],
    careerDrafts: [],
  };
}

function normalizeLocalAppState(value: unknown): LocalAppState | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { version?: unknown; tasks?: unknown; captures?: unknown; studyGoal?: unknown; studySessions?: unknown; portfolioProjects?: unknown; careerOpportunities?: unknown; socialPosts?: unknown; studyCards?: unknown; interviewPreps?: unknown; starStories?: unknown; careerEvidence?: unknown; emailItems?: unknown; careerDrafts?: unknown };
  if (!Array.isArray(candidate.tasks) || !candidate.tasks.every(isAgentTask)
    || !Array.isArray(candidate.captures) || !candidate.captures.every(isCaptureItem)) return null;
  if (candidate.version === 1) {
    return {
      version: 13,
      tasks: candidate.tasks as AgentTask[],
      captures: candidate.captures as CaptureItem[],
      studyGoal: null,
      studySessions: [],
      portfolioProjects: [],
      careerOpportunities: [],
      socialPosts: [],
      studyCards: [],
      interviewPreps: [],
      starStories: [],
      careerEvidence: [],
      emailItems: [],
      careerDrafts: [],
    };
  }
  const version = candidate.version;
  if (typeof version !== 'number' || ![2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].includes(version) || !Array.isArray(candidate.studySessions)) return null;
  const goal = candidate.studyGoal;
  const validGoal = goal === null || (
    Boolean(goal) && typeof goal === 'object'
    && typeof (goal as StudyGoal).id === 'string'
    && typeof (goal as StudyGoal).topic === 'string'
    && Number.isFinite((goal as StudyGoal).weeklyTargetMinutes)
    && Number.isFinite((goal as StudyGoal).availableMinutesToday)
    && typeof (goal as StudyGoal).updatedAt === 'string'
  );
  if (!validGoal || !candidate.studySessions.every(isStudySession)) return null;
  const projects = version === 2 ? [] : candidate.portfolioProjects;
  if (!Array.isArray(projects) || !projects.every(isPortfolioProject)) return null;
  const rawCareerOpportunities = version === 2 || version === 3 ? [] : candidate.careerOpportunities;
  if (!Array.isArray(rawCareerOpportunities)) return null;
  const careerOpportunities = version < 11
    ? rawCareerOpportunities.map((item) => item && typeof item === 'object' && !Array.isArray(item)
      ? { ...item, eligibilityItems: Array.isArray((item as Partial<CareerOpportunity>).eligibilityItems) ? (item as Partial<CareerOpportunity>).eligibilityItems : [], documents: Array.isArray((item as Partial<CareerOpportunity>).documents) ? (item as Partial<CareerOpportunity>).documents : [], nextAction: typeof (item as Partial<CareerOpportunity>).nextAction === 'string' ? (item as Partial<CareerOpportunity>).nextAction : '', nextActionDue: typeof (item as Partial<CareerOpportunity>).nextActionDue === 'string' ? (item as Partial<CareerOpportunity>).nextActionDue : '' }
      : item)
    : rawCareerOpportunities;
  if (!careerOpportunities.every(isCareerOpportunity)) return null;
  const socialPosts = version >= 5 ? candidate.socialPosts : [];
  if (!Array.isArray(socialPosts) || !socialPosts.every(isSocialPostDraft)) return null;
  const studyCards = version >= 6 ? candidate.studyCards : [];
  if (!Array.isArray(studyCards) || !studyCards.every(isStudyCard)) return null;
  const interviewPreps = version >= 7 ? candidate.interviewPreps : [];
  if (!Array.isArray(interviewPreps) || !interviewPreps.every(isInterviewPrep)) return null;
  const starStories = version >= 8 ? candidate.starStories : [];
  if (!Array.isArray(starStories) || !starStories.every(isStarStory)) return null;
  const careerEvidence = version >= 9 ? candidate.careerEvidence : [];
  if (!Array.isArray(careerEvidence) || !careerEvidence.every(isCareerEvidence)) return null;
  const emailItems = version >= 12 ? candidate.emailItems : [];
  if (!Array.isArray(emailItems) || emailItems.length > 100 || !emailItems.every(isEmailItem)) return null;
  const careerDrafts = version >= 13 ? candidate.careerDrafts : [];
  if (!Array.isArray(careerDrafts) || careerDrafts.length > 100 || !careerDrafts.every(isCareerDraft)) return null;
  const goalUpdatedAt = goal && typeof goal === 'object' ? new Date((goal as StudyGoal).updatedAt) : null;
  const normalizedGoal = goal && typeof goal === 'object'
    ? {
        ...(goal as StudyGoal),
        availabilityDate: typeof (goal as StudyGoal).availabilityDate === 'string'
          ? (goal as StudyGoal).availabilityDate
          : goalUpdatedAt && !Number.isNaN(goalUpdatedAt.getTime()) ? localDateKey(goalUpdatedAt) : localDateKey(),
      }
    : null;
  return {
    version: 13,
    tasks: candidate.tasks as AgentTask[],
    captures: candidate.captures as CaptureItem[],
    studyGoal: normalizedGoal,
    studySessions: candidate.studySessions,
    portfolioProjects: projects,
    careerOpportunities,
    socialPosts,
    studyCards,
    interviewPreps,
    starStories,
    careerEvidence,
    emailItems,
    careerDrafts,
  };
}

export function parseWorkspaceState(value: unknown): LocalAppState {
  const state = normalizeLocalAppState(value);
  if (!state) throw new Error('The cloud workspace has an unsupported schema or invalid data.');
  return state;
}

function isAgentTask(value: unknown): value is AgentTask {
  if (!value || typeof value !== 'object') return false;
  const task = value as Partial<AgentTask>;
  return typeof task.id === 'string' && typeof task.title === 'string'
    && ['Study', 'Career', 'Portfolio', 'Personal'].includes(task.category ?? '')
    && typeof task.dueLabel === 'string' && typeof task.done === 'boolean';
}

function isCaptureItem(value: unknown): value is CaptureItem {
  if (!value || typeof value !== 'object') return false;
  const capture = value as Partial<CaptureItem>;
  return typeof capture.id === 'string' && typeof capture.text === 'string'
    && ['Note', 'Idea'].includes(capture.kind ?? '') && typeof capture.createdAt === 'string'
    && ['text', 'voice'].includes(capture.modality ?? '') && capture.sourceSurface === 'web-app'
    && capture.context === 'Personal' && capture.origin === 'user-entered' && capture.sensitivity === 'personal'
    && typeof capture.timezone === 'string' && typeof capture.language === 'string'
    && capture.retention === 'local-until-deleted';
}

function isStudySession(value: unknown): value is StudySession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<StudySession>;
  return typeof session.id === 'string' && typeof session.goalId === 'string'
    && typeof session.topic === 'string' && Number.isFinite(session.plannedMinutes)
    && typeof session.completedAt === 'string';
}

function isPortfolioProjectVersion(value: unknown): value is PortfolioProjectVersion {
  if (!value || typeof value !== 'object') return false;
  const version = value as Partial<PortfolioProjectVersion>;
  return typeof version.id === 'string' && typeof version.title === 'string' && version.title.length <= 120
    && typeof version.summary === 'string' && version.summary.length <= 320
    && typeof version.content === 'string' && version.content.length <= 25000
    && typeof version.savedAt === 'string' && Number.isFinite(Date.parse(version.savedAt));
}

function isPortfolioProject(value: unknown): value is PortfolioProject {
  if (!value || typeof value !== 'object') return false;
  const project = value as Partial<PortfolioProject>;
  return typeof project.id === 'string' && typeof project.title === 'string' && project.title.length <= 120
    && typeof project.summary === 'string' && project.summary.length <= 320
    && typeof project.content === 'string' && project.content.length <= 25000
    && typeof project.updatedAt === 'string' && Number.isFinite(Date.parse(project.updatedAt)) && Array.isArray(project.versions)
    && project.versions.length <= 30
    && project.versions.every(isPortfolioProjectVersion);
}

function isCareerOpportunity(value: unknown): value is CareerOpportunity {
  if (!value || typeof value !== 'object') return false;
  const opportunity = value as Partial<CareerOpportunity>;
  const stages: OpportunityStage[] = ['Saved', 'Researching', 'Drafting', 'Ready to submit', 'Submitted', 'Interview', 'Offer', 'Closed'];
  const validDeadline = opportunity.deadline === '' || (typeof opportunity.deadline === 'string' && isDateOnly(opportunity.deadline));
  const validUrl = typeof opportunity.sourceUrl === 'string' && opportunity.sourceUrl.length <= 2048
    && (!opportunity.sourceUrl || (() => { try { return ['http:', 'https:'].includes(new URL(opportunity.sourceUrl).protocol); } catch { return false; } })());
  const validEligibility = Array.isArray(opportunity.eligibilityItems) && opportunity.eligibilityItems.length <= 100 && opportunity.eligibilityItems.every(isEligibilityCheck);
  const validDocuments = Array.isArray(opportunity.documents) && opportunity.documents.length <= 100 && opportunity.documents.every(isApplicationDocument);
  const validNextActionDue = typeof opportunity.nextActionDue === 'string' && (opportunity.nextActionDue === '' || isDateOnly(opportunity.nextActionDue));
  return typeof opportunity.id === 'string' && ['Job', 'Scholarship'].includes(opportunity.kind ?? '')
    && typeof opportunity.title === 'string' && opportunity.title.trim().length > 0 && opportunity.title.length <= 160
    && typeof opportunity.organization === 'string' && opportunity.organization.trim().length > 0 && opportunity.organization.length <= 120
    && validUrl && validDeadline && stages.includes(opportunity.stage as OpportunityStage)
    && typeof opportunity.fitNotes === 'string' && opportunity.fitNotes.length <= 5000
    && validEligibility && validDocuments
    && typeof opportunity.nextAction === 'string' && opportunity.nextAction.length <= 240 && validNextActionDue
    && (!opportunity.nextActionDue || Boolean(opportunity.nextAction.trim()))
    && typeof opportunity.createdAt === 'string' && Number.isFinite(Date.parse(opportunity.createdAt))
    && typeof opportunity.updatedAt === 'string' && Number.isFinite(Date.parse(opportunity.updatedAt));
}

function isEligibilityCheck(value: unknown): value is EligibilityCheck {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<EligibilityCheck>;
  const statuses: EligibilityStatus[] = ['To check', 'Meets', 'Does not meet'];
  const validUrl = typeof item.sourceUrl === 'string' && item.sourceUrl.length <= 2048
    && (!item.sourceUrl || (() => { try { return ['http:', 'https:'].includes(new URL(item.sourceUrl).protocol); } catch { return false; } })());
  return typeof item.id === 'string' && typeof item.requirement === 'string' && item.requirement.trim().length > 0 && item.requirement.length <= 200
    && statuses.includes(item.status as EligibilityStatus)
    && typeof item.notes === 'string' && item.notes.length <= 2000 && validUrl;
}

function isApplicationDocument(value: unknown): value is ApplicationDocument {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<ApplicationDocument>;
  const statuses: ApplicationDocumentStatus[] = ['Not started', 'In progress', 'Ready', 'Submitted'];
  return typeof item.id === 'string' && typeof item.name === 'string' && item.name.trim().length > 0 && item.name.length <= 200
    && statuses.includes(item.status as ApplicationDocumentStatus)
    && typeof item.notes === 'string' && item.notes.length <= 2000;
}

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isSocialPostDraft(value: unknown): value is SocialPostDraft {
  if (!value || typeof value !== 'object') return false;
  const post = value as Partial<SocialPostDraft>;
  const channels: SocialChannel[] = ['Facebook', 'Instagram', 'X'];
  const validPlannedFor = typeof post.plannedFor === 'string' && (post.plannedFor === '' || (() => {
    const date = new Date(post.plannedFor as string);
    return !Number.isNaN(date.getTime()) && date.toISOString() === post.plannedFor;
  })());
  const validTimeZone = typeof post.timezone === 'string' && post.timezone.length <= 100 && (() => {
    try { new Intl.DateTimeFormat(undefined, { timeZone: post.timezone }); return true; } catch { return false; }
  })();
  return typeof post.id === 'string' && typeof post.title === 'string' && post.title.trim().length > 0 && post.title.length <= 120
    && typeof post.body === 'string' && post.body.trim().length > 0 && post.body.length <= 5000
    && Array.isArray(post.channels) && post.channels.length > 0 && post.channels.length <= channels.length
    && post.channels.every((channel) => channels.includes(channel)) && new Set(post.channels).size === post.channels.length
    && validPlannedFor && validTimeZone
    && typeof post.createdAt === 'string' && Number.isFinite(Date.parse(post.createdAt))
    && typeof post.updatedAt === 'string' && Number.isFinite(Date.parse(post.updatedAt));
}

function isStudyCard(value: unknown): value is StudyCard {
  if (!value || typeof value !== 'object') return false;
  const card = value as Partial<StudyCard>;
  return typeof card.id === 'string' && typeof card.topic === 'string' && card.topic.trim().length > 0 && card.topic.length <= 120
    && typeof card.question === 'string' && card.question.trim().length > 0 && card.question.length <= 1000
    && typeof card.answer === 'string' && card.answer.trim().length > 0 && card.answer.length <= 10000
    && typeof card.nextReviewAt === 'string' && Number.isFinite(Date.parse(card.nextReviewAt))
    && Number.isInteger(card.intervalDays) && (card.intervalDays ?? -1) >= 0 && (card.intervalDays ?? 31) <= 30
    && Number.isInteger(card.reviewCount) && (card.reviewCount ?? -1) >= 0
    && typeof card.lastReviewedAt === 'string' && (!card.lastReviewedAt || Number.isFinite(Date.parse(card.lastReviewedAt)))
    && typeof card.createdAt === 'string' && Number.isFinite(Date.parse(card.createdAt))
    && typeof card.updatedAt === 'string' && Number.isFinite(Date.parse(card.updatedAt));
}

function isInterviewAssessmentItem(value: unknown): value is InterviewAssessmentItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<InterviewAssessmentItem>;
  const categories = ['behavioral', 'technical', 'situational', 'leadership'];
  return typeof item.id === 'string'
    && typeof item.question === 'string' && item.question.trim().length > 0 && item.question.length <= 1000
    && categories.includes(item.category ?? '')
    && typeof item.userAnswer === 'string' && item.userAnswer.length <= 10000
    && typeof item.score === 'number' && Number.isFinite(item.score) && item.score >= 0 && item.score <= 100
    && (item.starCoverage === undefined || (
      typeof item.starCoverage === 'object' && item.starCoverage !== null
      && typeof item.starCoverage.situation === 'boolean'
      && typeof item.starCoverage.task === 'boolean'
      && typeof item.starCoverage.action === 'boolean'
      && typeof item.starCoverage.result === 'boolean'
    ))
    && Array.isArray(item.strengths) && item.strengths.every((s) => typeof s === 'string')
    && Array.isArray(item.improvements) && item.improvements.every((s) => typeof s === 'string')
    && (item.suggestedPhrasing === undefined || typeof item.suggestedPhrasing === 'string')
    && (item.assessedAt === undefined || (typeof item.assessedAt === 'string' && Number.isFinite(Date.parse(item.assessedAt))));
}

function isInterviewPrep(value: unknown): value is InterviewPrep {
  if (!value || typeof value !== 'object') return false;
  const prep = value as Partial<InterviewPrep>;
  const formats: InterviewFormat[] = ['Screening', 'Technical', 'Behavioral', 'System Design', 'Hiring Manager', 'Case Study'];
  const validScheduled = typeof prep.scheduledAt === 'string' && (prep.scheduledAt === '' || Number.isFinite(Date.parse(prep.scheduledAt)));
  return typeof prep.id === 'string'
    && (prep.opportunityId === undefined || typeof prep.opportunityId === 'string')
    && typeof prep.roleTitle === 'string' && prep.roleTitle.trim().length > 0 && prep.roleTitle.length <= 160
    && typeof prep.company === 'string' && prep.company.trim().length > 0 && prep.company.length <= 120
    && formats.includes(prep.format as InterviewFormat)
    && validScheduled
    && typeof prep.locationOrLink === 'string' && prep.locationOrLink.length <= 500
    && typeof prep.interviewers === 'string' && prep.interviewers.length <= 500
    && Array.isArray(prep.focusTopics) && prep.focusTopics.every((t) => typeof t === 'string')
    && typeof prep.jobContext === 'string' && prep.jobContext.length <= 10000
    && Array.isArray(prep.questions) && prep.questions.every(isInterviewAssessmentItem)
    && Array.isArray(prep.questionsToAsk) && prep.questionsToAsk.every((q) => typeof q === 'string')
    && (prep.preparationChecklist === undefined || (
      typeof prep.preparationChecklist === 'object' && prep.preparationChecklist !== null
      && typeof prep.preparationChecklist.researchedOrganization === 'boolean'
      && typeof prep.preparationChecklist.reviewedRoleRequirements === 'boolean'
      && typeof prep.preparationChecklist.preparedEvidenceStories === 'boolean'
      && typeof prep.preparationChecklist.checkedLogistics === 'boolean'
      && typeof prep.preparationChecklist.preparedQuestions === 'boolean'
    ))
    && typeof prep.notes === 'string' && prep.notes.length <= 10000
    && (prep.elevatorPitch === undefined || (typeof prep.elevatorPitch === 'string' && prep.elevatorPitch.length <= 5000))
    && typeof prep.readinessScore === 'number' && Number.isFinite(prep.readinessScore)
    && typeof prep.createdAt === 'string' && Number.isFinite(Date.parse(prep.createdAt))
    && typeof prep.updatedAt === 'string' && Number.isFinite(Date.parse(prep.updatedAt));
}

function isStarStory(value: unknown): value is StarStory {
  if (!value || typeof value !== 'object') return false;
  const story = value as Partial<StarStory>;
  return typeof story.id === 'string'
    && typeof story.title === 'string' && story.title.trim().length > 0 && story.title.length <= 160
    && Array.isArray(story.competencies) && story.competencies.length <= 12 && story.competencies.every((c) => typeof c === 'string' && c.length <= 100)
    && typeof story.situation === 'string' && story.situation.length <= 5000
    && typeof story.task === 'string' && story.task.length <= 5000
    && typeof story.action === 'string' && story.action.length <= 10000
    && typeof story.result === 'string' && story.result.length <= 5000
    && typeof story.metrics === 'string' && story.metrics.length <= 1000
    && (story.lastUsedAt === undefined || (typeof story.lastUsedAt === 'string' && Number.isFinite(Date.parse(story.lastUsedAt))))
    && typeof story.createdAt === 'string' && Number.isFinite(Date.parse(story.createdAt))
    && typeof story.updatedAt === 'string' && Number.isFinite(Date.parse(story.updatedAt));
}

function isCareerEvidence(value: unknown): value is CareerEvidence {
  if (!value || typeof value !== 'object') return false;
  const evidence = value as Partial<CareerEvidence>;
  const kinds: CareerEvidenceKind[] = ['Experience', 'Education', 'Skill', 'Achievement', 'Project', 'Credential'];
  const validUrl = typeof evidence.sourceUrl === 'string' && evidence.sourceUrl.length <= 2048
    && (!evidence.sourceUrl || (() => { try { return ['http:', 'https:'].includes(new URL(evidence.sourceUrl).protocol); } catch { return false; } })());
  const validVerification = typeof evidence.verifiedAt === 'string'
    && (evidence.verifiedAt === '' || Number.isFinite(Date.parse(evidence.verifiedAt)))
    && (!evidence.verifiedAt || Boolean((typeof evidence.sourceLabel === 'string' && evidence.sourceLabel.trim()) || evidence.sourceUrl));
  return typeof evidence.id === 'string'
    && kinds.includes(evidence.kind as CareerEvidenceKind)
    && typeof evidence.title === 'string' && evidence.title.trim().length > 0 && evidence.title.length <= 160
    && typeof evidence.organization === 'string' && evidence.organization.length <= 160
    && typeof evidence.timeframe === 'string' && evidence.timeframe.length <= 100
    && typeof evidence.details === 'string' && evidence.details.length <= 5000
    && Array.isArray(evidence.skills) && evidence.skills.length <= 12 && evidence.skills.every((skill) => typeof skill === 'string' && skill.trim().length > 0 && skill.length <= 70)
    && typeof evidence.sourceLabel === 'string' && evidence.sourceLabel.length <= 300
    && validUrl && validVerification
    && typeof evidence.createdAt === 'string' && Number.isFinite(Date.parse(evidence.createdAt))
    && typeof evidence.updatedAt === 'string' && Number.isFinite(Date.parse(evidence.updatedAt));
}

function isEmailItem(value: unknown): value is EmailItem {
  if (!value || typeof value !== 'object') return false;
  const email = value as Partial<EmailItem>;
  const categories: EmailTriageCategory[] = ['Career', 'Scholarship', 'Work', 'Personal', 'Other'];
  const priorities: EmailPriority[] = ['High', 'Normal', 'Low'];
  const statuses: EmailStatus[] = ['Needs reply', 'Draft ready', 'Waiting', 'Done', 'Archived'];
  const validDate = (date: unknown) => typeof date === 'string' && (date === '' || isDateOnly(date));
  return typeof email.id === 'string'
    && typeof email.sender === 'string' && email.sender.trim().length > 0 && email.sender.length <= 250
    && typeof email.subject === 'string' && email.subject.trim().length > 0 && email.subject.length <= 500
    && typeof email.body === 'string' && email.body.trim().length > 0 && email.body.length <= 8000
    && validDate(email.receivedAt) && categories.includes(email.category as EmailTriageCategory)
    && priorities.includes(email.priority as EmailPriority) && statuses.includes(email.status as EmailStatus)
    && validDate(email.followUpDue) && typeof email.replyDraft === 'string' && email.replyDraft.length <= 8000
    && typeof email.createdAt === 'string' && Number.isFinite(Date.parse(email.createdAt))
    && typeof email.updatedAt === 'string' && Number.isFinite(Date.parse(email.updatedAt));
}

function isCareerDraft(value: unknown): value is CareerDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<CareerDraft>;
  const kinds: CareerDraftKind[] = ['CV excerpt', 'Cover letter', 'Scholarship statement outline'];
  return typeof draft.id === 'string' && kinds.includes(draft.kind as CareerDraftKind)
    && typeof draft.title === 'string' && draft.title.trim().length > 0 && draft.title.length <= 180
    && (draft.opportunityId === undefined || typeof draft.opportunityId === 'string')
    && typeof draft.targetRole === 'string' && draft.targetRole.length <= 160
    && typeof draft.organization === 'string' && draft.organization.length <= 160
    && typeof draft.content === 'string' && draft.content.length <= 20000
    && Array.isArray(draft.evidenceIds) && draft.evidenceIds.length <= 40 && draft.evidenceIds.every((id) => typeof id === 'string')
    && typeof draft.createdAt === 'string' && Number.isFinite(Date.parse(draft.createdAt))
    && typeof draft.updatedAt === 'string' && Number.isFinite(Date.parse(draft.updatedAt));
}

export function createWorkspaceBackup(state: LocalAppState): string {
  const backup: WorkspaceBackup = {
    format: 'silverstone-workspace-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    state,
  };
  return JSON.stringify(backup, null, 2);
}

export function parseWorkspaceBackup(serialized: string): LocalAppState {
  let backup: unknown;
  try {
    backup = JSON.parse(serialized);
  } catch {
    throw new Error('This file is not valid JSON. Choose a Silverstone backup file.');
  }
  if (!backup || typeof backup !== 'object') throw new Error('This file is not a Silverstone backup.');
  const candidate = backup as Partial<WorkspaceBackup>;
  if (candidate.format !== 'silverstone-workspace-backup' || candidate.version !== 1) {
    throw new Error('This backup format is not supported.');
  }
  const state = normalizeLocalAppState(candidate.state);
  if (!state) throw new Error('The backup contains invalid workspace data.');
  return state;
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.reject(new Error('IndexedDB is unavailable in this environment.'));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(OBJECT_STORE)) {
        database.createObjectStore(OBJECT_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error('Could not open the local Silverstone database.'));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error('The local Silverstone database upgrade is blocked by another tab.'));
    };
  });

  return databasePromise;
}

function readWorkspace(database: IDBDatabase): Promise<LocalAppState | null> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(OBJECT_STORE, 'readonly');
    const request = transaction.objectStore(OBJECT_STORE).get(WORKSPACE_KEY) as IDBRequest<WorkspaceRecord | undefined>;
    request.onsuccess = () => {
      resolve(normalizeLocalAppState(request.result?.state));
    };
    request.onerror = () => reject(request.error ?? new Error('Could not read the local workspace.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Reading the local workspace was interrupted.'));
  });
}

function writeWorkspace(database: IDBDatabase, state: LocalAppState): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(OBJECT_STORE, 'readwrite');
    transaction.objectStore(OBJECT_STORE).put({ key: WORKSPACE_KEY, state } satisfies WorkspaceRecord);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save the local workspace.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Saving the local workspace was interrupted.'));
  });
}

function deleteWorkspace(database: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(OBJECT_STORE, 'readwrite');
    transaction.objectStore(OBJECT_STORE).delete(WORKSPACE_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not clear the local workspace.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Clearing the local workspace was interrupted.'));
  });
}

function readLegacyState(): { state: LocalAppState | null; key: string | null } {
  if (typeof window === 'undefined') return { state: null, key: null };
  for (const key of LEGACY_STORAGE_KEYS) {
    try {
      const stored = window.localStorage.getItem(key);
      if (!stored) continue;
      const parsed: unknown = JSON.parse(stored);
      const state = normalizeLocalAppState(parsed);
      if (state) return { state, key };
    } catch {
      // Try the next legacy key if browser storage or this record is invalid.
    }
  }
  return { state: null, key: null };
}

function hasFallbackOverride(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(FALLBACK_MODE_KEY) === 'active';
  } catch {
    return false;
  }
}

function removeLegacyState(): void {
  if (typeof window === 'undefined') return;
  for (const key of LEGACY_STORAGE_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // IndexedDB holds the current copy, so a stale legacy copy can be cleaned up later.
    }
  }
  try {
    window.localStorage.removeItem(FALLBACK_MODE_KEY);
  } catch {
    // This marker is only needed while IndexedDB is unavailable.
  }
}

function saveLegacyState(state: LocalAppState): void {
  if (typeof window === 'undefined') throw new Error('Browser storage is unavailable.');
  window.localStorage.setItem(LEGACY_STORAGE_KEYS[0], JSON.stringify(state));
  for (const key of LEGACY_STORAGE_KEYS.slice(1)) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // The current Silverstone key was saved successfully.
    }
  }
}

export async function loadLocalState(): Promise<LocalAppState> {
  if (typeof window === 'undefined') return createInitialState();

  const fallbackState = readLegacyState().state;
  if (fallbackState && hasFallbackOverride()) {
    try {
      const database = await openDatabase();
      await writeWorkspace(database, fallbackState);
      activeStorageBackend = 'indexeddb';
      removeLegacyState();
      return fallbackState;
    } catch {
      activeStorageBackend = 'localstorage';
      return fallbackState;
    }
  }

  try {
    const database = await openDatabase();
    const storedState = await readWorkspace(database);
    if (storedState) {
      activeStorageBackend = 'indexeddb';
      removeLegacyState();
      return storedState;
    }

    const legacy = readLegacyState();
    const migratedState = legacy.state ?? createInitialState();
    await writeWorkspace(database, migratedState);
    activeStorageBackend = 'indexeddb';
    removeLegacyState();
    return migratedState;
  } catch {
    activeStorageBackend = 'localstorage';
    return readLegacyState().state ?? createInitialState();
  }
}

export async function saveLocalState(state: LocalAppState): Promise<'indexeddb' | 'localstorage'> {
  try {
    const database = await openDatabase();
    await writeWorkspace(database, state);
    activeStorageBackend = 'indexeddb';
    removeLegacyState();
    return 'indexeddb';
  } catch (indexedDbError) {
    try {
      if (typeof window !== 'undefined') window.localStorage.setItem(FALLBACK_MODE_KEY, 'active');
      saveLegacyState(state);
      activeStorageBackend = 'localstorage';
      return 'localstorage';
    } catch {
      throw indexedDbError;
    }
  }
}

export async function clearLocalState(): Promise<void> {
  try {
    const database = await openDatabase();
    await deleteWorkspace(database);
    activeStorageBackend = 'indexeddb';
  } catch (indexedDbError) {
    if (typeof window === 'undefined' || 'indexedDB' in window || activeStorageBackend !== 'localstorage') throw indexedDbError;
    removeLegacyState();
    return;
  }
  removeLegacyState();
}

export function createId(prefix: string): string {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${id}`;
}
