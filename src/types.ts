export type PageKey =
  | 'today'
  | 'study'
  | 'career'
  | 'portfolio'
  | 'studio'
  | 'library'
  | 'observation'
  | 'activity'
  | 'settings';

export type TaskCategory = 'Study' | 'Career' | 'Portfolio' | 'Personal';

export interface AgentTask {
  id: string;
  title: string;
  category: TaskCategory;
  dueLabel: string;
  done: boolean;
}

export interface CaptureItem {
  id: string;
  text: string;
  kind: 'Note' | 'Idea';
  createdAt: string;
  modality: 'text' | 'voice';
  sourceSurface: 'web-app';
  context: 'Personal';
  origin: 'user-entered';
  sensitivity: 'personal';
  timezone: string;
  language: string;
  retention: 'local-until-deleted';
}

export interface StudyGoal {
  id: string;
  topic: string;
  weeklyTargetMinutes: number;
  availableMinutesToday: number;
  availabilityDate: string;
  updatedAt: string;
}

export interface StudySession {
  id: string;
  goalId: string;
  topic: string;
  plannedMinutes: number;
  completedAt: string;
}

export interface PortfolioProjectVersion {
  id: string;
  title: string;
  summary: string;
  content: string;
  savedAt: string;
}

export interface PortfolioProject {
  id: string;
  title: string;
  summary: string;
  content: string;
  updatedAt: string;
  versions: PortfolioProjectVersion[];
}

export type OpportunityKind = 'Job' | 'Scholarship';
export type OpportunityStage = 'Saved' | 'Researching' | 'Drafting' | 'Ready to submit' | 'Submitted' | 'Interview' | 'Offer' | 'Closed';

export interface CareerOpportunity {
  id: string;
  kind: OpportunityKind;
  title: string;
  organization: string;
  sourceUrl: string;
  deadline: string;
  stage: OpportunityStage;
  fitNotes: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocalAppState {
  version: 4;
  tasks: AgentTask[];
  captures: CaptureItem[];
  studyGoal: StudyGoal | null;
  studySessions: StudySession[];
  portfolioProjects: PortfolioProject[];
  careerOpportunities: CareerOpportunity[];
}
