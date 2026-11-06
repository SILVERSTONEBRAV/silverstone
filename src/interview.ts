import type { InterviewAssessmentItem, InterviewFormat } from './types';

export const INTERVIEW_FORMATS: InterviewFormat[] = [
  'Screening',
  'Technical',
  'Behavioral',
  'System Design',
  'Hiring Manager',
  'Case Study',
];

export const DEFAULT_QUESTIONS_BY_FORMAT: Record<InterviewFormat, Array<{ question: string; category: InterviewAssessmentItem['category'] }>> = {
  Screening: [
    { question: 'Walk me through your background and why your experience fits this role.', category: 'situational' },
    { question: 'What prompted your interest in our company, and what are you looking for in your next step?', category: 'behavioral' },
    { question: 'What are your expectations regarding compensation, remote/hybrid setup, and timeline?', category: 'situational' },
  ],
  Behavioral: [
    { question: 'Tell me about a challenging technical or interpersonal conflict you resolved on a project.', category: 'behavioral' },
    { question: 'Describe a time you had to deliver under a tight deadline with ambiguous requirements.', category: 'behavioral' },
    { question: 'Give an example of a mistake you made or a project that failed. What did you learn?', category: 'behavioral' },
    { question: 'Tell me about a time you had to convince a team or stakeholder to adopt your technical proposal.', category: 'leadership' },
  ],
  Technical: [
    { question: 'Walk me through the architecture of a complex project you built recently. What were the key trade-offs?', category: 'technical' },
    { question: 'How do you approach debugging and root-cause analysis when an unexpected incident occurs in production?', category: 'technical' },
    { question: 'How do you ensure code quality, test coverage, and performance before releasing to users?', category: 'technical' },
  ],
  'System Design': [
    { question: 'How would you design a distributed, high-throughput notification or activity feed service?', category: 'technical' },
    { question: 'How do you choose between strong consistency and eventual consistency for high-scale data stores?', category: 'technical' },
    { question: 'Walk me through your caching strategy: cache invalidation, stampede prevention, and storage tiers.', category: 'technical' },
  ],
  'Hiring Manager': [
    { question: 'Why are you interested in this role and why our company specifically?', category: 'situational' },
    { question: 'What kind of engineering culture and leadership style brings out your best work?', category: 'leadership' },
    { question: 'Where do you see your technical and personal impact growing over the next 18 to 24 months?', category: 'leadership' },
  ],
  'Case Study': [
    { question: 'Given a 30% drop in user activation after a major redesign, how would you diagnose and prioritize solutions?', category: 'situational' },
    { question: 'How would you define and measure the success metrics (KPIs) for our core workflow over the next quarter?', category: 'leadership' },
  ],
};

export const DEFAULT_QUESTIONS_TO_ASK: Record<InterviewFormat, string[]> = {
  Screening: [
    'What does the typical hiring process and timeline look like following this call?',
    'What are the key qualities the team is prioritizing for this specific role?',
  ],
  Behavioral: [
    'How does the team handle cross-functional disagreements between engineering and product?',
    'Can you share an example of a recent project where the team took a smart risk that paid off?',
  ],
  Technical: [
    'How does the team balance shipping product features with paying down architectural technical debt?',
    'What does the code review, CI/CD, and deployment cycle look like on a typical week?',
  ],
  'System Design': [
    'What is the single biggest architectural bottleneck or scalability hurdle the platform faces right now?',
    'How are architectural decisions documented and shared across distributed squads?',
  ],
  'Hiring Manager': [
    'What would a successful first 90 days look like for someone stepping into this role?',
    'What are the most exciting strategic priorities for the team over the next 6 to 12 months?',
  ],
  'Case Study': [
    'How quickly does the organization validate experiments and roll back changes if hypotheses fail?',
    'What data infrastructure or user research resources are available to guide decisions?',
  ],
};

export interface AssessmentResult {
  score: number;
  wordCount: number;
  estimatedDurationSeconds: number;
  starCoverage: {
    situation: boolean;
    task: boolean;
    action: boolean;
    result: boolean;
  };
  strengths: string[];
  improvements: string[];
  suggestedPhrasing: string;
}

export function assessInterviewAnswer(
  question: string,
  answer: string,
  category: InterviewAssessmentItem['category'],
  _roleTitle = '',
  _company = '',
): AssessmentResult {
  const clean = answer.trim();
  const words = clean.length > 0 ? clean.split(/\s+/).filter(Boolean) : [];
  const count = words.length;
  const lower = clean.toLowerCase();

  // Duration estimate: ~135 words per minute spoken
  const estimatedSeconds = Math.round((count / 135) * 60);

  // STAR Method detection
  const situationKeywords = [
    'at my previous', 'in my last role', 'at the time', 'context', 'project',
    'client', 'faced with', 'we were building', 'our team was', 'when i worked',
    'background', 'legacy', 'architecture', 'situation',
  ];
  const taskKeywords = [
    'my task', 'my role was', 'goal was', 'objective', 'needed to', 'had to',
    'responsible for', 'challenge', 'requirement', 'deadline', 'problem to solve',
  ];
  const actionKeywords = [
    'i designed', 'i built', 'i implemented', 'i led', 'i proposed', 'i refactored',
    'i investigated', 'i analyzed', 'i chose', 'i scheduled', 'i coordinated',
    'i wrote', 'i created', 'i migrated', 'my approach', 'i decided', 'i introduced',
  ];
  const resultKeywords = [
    'result', 'outcome', 'impact', 'increased', 'reduced', 'decreased', 'improved',
    'saved', '%', 'percent', 'latency', 'users', 'revenue', 'delivered', 'shipped',
    'successfully', 'metric', 'feedback', 'downtime', 'efficiency',
  ];

  const hasSituation = situationKeywords.some((keyword) => lower.includes(keyword));
  const hasTask = taskKeywords.some((keyword) => lower.includes(keyword));
  const hasAction = actionKeywords.some((keyword) => lower.includes(keyword)) || (/\bi\s+(did|made|took|ran|set|tested|worked|solved)\b/i.test(clean));
  const hasResult = resultKeywords.some((keyword) => lower.includes(keyword)) || (/\b\d+(\.\d+)?(%|x|ms|s|h|k|m)\b/i.test(clean));

  const starCount = [hasSituation, hasTask, hasAction, hasResult].filter(Boolean).length;

  // Personal ownership vs vague "we"
  const iMatches = clean.match(/\b(i|my|me)\b/gi)?.length ?? 0;
  const weMatches = clean.match(/\b(we|our|us)\b/gi)?.length ?? 0;

  // Metrics and technical numbers
  const hasNumbers = /\b\d+(\.\d+)?(%|x|ms|s|h|k|m|hours|days|weeks|months|users|queries)?\b/i.test(clean);

  // Check question relevance
  const questionWords = question.toLowerCase().split(/\s+/).filter((w) => w.length > 3 && !['what', 'when', 'tell', 'about', 'your', 'with', 'have', 'from', 'this', 'that'].includes(w));
  const matchesQuestionTheme = questionWords.some((w) => lower.includes(w));

  // Strengths identification
  const strengths: string[] = [];
  if (matchesQuestionTheme && count >= 35) {
    strengths.push('Directly connects to key concepts raised in the question prompt.');
  }
  if (starCount >= 3) {
    strengths.push('Follows the structured STAR framework (Situation, Task, Action, Result).');
  }
  if (hasAction && iMatches >= 2) {
    strengths.push('Clear first-person ownership highlighting your individual contributions.');
  }
  if (hasResult) {
    strengths.push('Highlights tangible outcomes and business or engineering impact.');
  }
  if (hasNumbers) {
    strengths.push('Includes specific quantitative metrics or timeframes that build credibility.');
  }
  if (count >= 80 && count <= 300) {
    strengths.push(`Paced well for verbal delivery (~${estimatedSeconds} seconds spoken).`);
  }
  if (strengths.length === 0 && count > 30) {
    strengths.push('Addresses the question directly and provides a solid starting point.');
  }

  // Improvements identification
  const improvements: string[] = [];
  if (count < 40) {
    improvements.push(`Answer is too brief (${count} words). Provide more context, specific actions, and lessons learned.`);
  } else if (count > 420) {
    improvements.push(`Answer is quite lengthy (~${Math.round(estimatedSeconds / 60)} minutes spoken). Tighten the story to avoid losing the interviewer's attention.`);
  }

  if (!hasSituation && category === 'behavioral') {
    improvements.push('Set the scene with 1-2 sentences of context (company, project scale, or initial constraints).');
  }
  if (!hasAction) {
    improvements.push('Be more explicit about what *you* personally did, decided, or coded rather than just the team.');
  }
  if (weMatches > 3 && iMatches <= 1) {
    improvements.push('Overuses "we" without defining your personal responsibility. Clarify your specific role.');
  }
  if (!hasResult) {
    improvements.push('Conclude with concrete results: performance improvements, delivered features, or team learnings.');
  }
  if (!hasNumbers && (category === 'technical' || category === 'behavioral')) {
    improvements.push('Add specific numbers (e.g. latency reduced by X%, team size of Y, or shipped within Z weeks).');
  }

  // Calculate score (0 to 100)
  let baseScore = 45;
  if (count >= 30) baseScore += 10;
  if (count >= 70 && count <= 350) baseScore += 15;
  baseScore += starCount * 7;
  if (hasNumbers) baseScore += 6;
  if (iMatches >= 2) baseScore += 5;
  if (improvements.length === 0) baseScore += 5;
  if (count < 25) baseScore = Math.min(baseScore, 35);
  const score = Math.max(15, Math.min(98, baseScore));

  // Suggested phrasing
  let suggestedPhrasing = '';
  if (!hasResult) {
    suggestedPhrasing = 'Conclude with: "As a result of this approach, we [metric or outcome], and I learned that [key architectural or team takeaway]."';
  } else if (!hasAction) {
    suggestedPhrasing = 'Bridge your story with: "My specific contribution was to [design/build/lead X], where I chose to [key technical decision] because [reason]."';
  } else {
    suggestedPhrasing = 'Strong structure! Keep your opening hook crisp: "In my recent work at [Company], I took ownership of [Project] when [Challenge arose]..."';
  }

  return {
    score,
    wordCount: count,
    estimatedDurationSeconds: estimatedSeconds,
    starCoverage: {
      situation: hasSituation,
      task: hasTask,
      action: hasAction,
      result: hasResult,
    },
    strengths,
    improvements,
    suggestedPhrasing,
  };
}

export function calculateReadiness(questions: InterviewAssessmentItem[]): number {
  const answered = questions.filter((q) => q.userAnswer.trim().length > 0 && q.score > 0);
  if (answered.length === 0) return 0;
  const total = answered.reduce((acc, curr) => acc + curr.score, 0);
  return Math.round(total / questions.length); // Factor in coverage of all planned questions
}
