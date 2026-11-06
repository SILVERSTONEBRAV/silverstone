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

export interface StudyCard {
  id: string;
  topic: string;
  question: string;
  answer: string;
  nextReviewAt: string;
  intervalDays: number;
  reviewCount: number;
  lastReviewedAt: string;
  createdAt: string;
  updatedAt: string;
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
export type EligibilityStatus = 'To check' | 'Meets' | 'Does not meet';
export type ApplicationDocumentStatus = 'Not started' | 'In progress' | 'Ready' | 'Submitted';

export interface EligibilityCheck {
  id: string;
  requirement: string;
  status: EligibilityStatus;
  notes: string;
  sourceUrl: string;
}

export interface ApplicationDocument {
  id: string;
  name: string;
  status: ApplicationDocumentStatus;
  notes: string;
}

export interface CareerOpportunity {
  id: string;
  kind: OpportunityKind;
  title: string;
  organization: string;
  sourceUrl: string;
  deadline: string;
  stage: OpportunityStage;
  fitNotes: string;
  eligibilityItems: EligibilityCheck[];
  documents: ApplicationDocument[];
  nextAction: string;
  nextActionDue: string;
  createdAt: string;
  updatedAt: string;
}

export type SocialChannel = 'Facebook' | 'Instagram' | 'X';

export interface SocialPostDraft {
  id: string;
  title: string;
  body: string;
  channels: SocialChannel[];
  plannedFor: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export type InterviewFormat = 'Screening' | 'Technical' | 'Behavioral' | 'System Design' | 'Hiring Manager' | 'Case Study';

export interface InterviewPreparationChecklist {
  researchedOrganization: boolean;
  reviewedRoleRequirements: boolean;
  preparedEvidenceStories: boolean;
  checkedLogistics: boolean;
  preparedQuestions: boolean;
}

export interface InterviewAssessmentItem {
  id: string;
  question: string;
  category: 'behavioral' | 'technical' | 'situational' | 'leadership';
  userAnswer: string;
  score: number; // 0 - 100
  starCoverage?: {
    situation: boolean;
    task: boolean;
    action: boolean;
    result: boolean;
  };
  strengths: string[];
  improvements: string[];
  suggestedPhrasing?: string;
  assessedAt?: string;
}

export interface InterviewPrep {
  id: string;
  opportunityId?: string;
  roleTitle: string;
  company: string;
  format: InterviewFormat;
  scheduledAt: string;
  locationOrLink: string;
  interviewers: string;
  focusTopics: string[];
  jobContext: string;
  questions: InterviewAssessmentItem[];
  questionsToAsk: string[];
  preparationChecklist?: InterviewPreparationChecklist;
  notes: string;
  elevatorPitch?: string;
  readinessScore: number;
  createdAt: string;
  updatedAt: string;
}

export interface StarStory {
  id: string;
  title: string;
  competencies: string[];
  situation: string;
  task: string;
  action: string;
  result: string;
  metrics: string;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type CareerEvidenceKind = 'Experience' | 'Education' | 'Skill' | 'Achievement' | 'Project' | 'Credential';

export interface CareerEvidence {
  id: string;
  kind: CareerEvidenceKind;
  title: string;
  organization: string;
  timeframe: string;
  details: string;
  skills: string[];
  sourceLabel: string;
  sourceUrl: string;
  verifiedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocalAppState {
  version: 11;
  tasks: AgentTask[];
  captures: CaptureItem[];
  studyGoal: StudyGoal | null;
  studySessions: StudySession[];
  portfolioProjects: PortfolioProject[];
  careerOpportunities: CareerOpportunity[];
  socialPosts: SocialPostDraft[];
  studyCards: StudyCard[];
  interviewPreps: InterviewPrep[];
  starStories: StarStory[];
  careerEvidence: CareerEvidence[];
}
