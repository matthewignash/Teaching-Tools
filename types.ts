export enum AssessmentStatus {
  DRAFT = 'DRAFT',
  READY = 'READY',
  GRADING = 'GRADING',
  COMPLETED = 'COMPLETED'
}

export type QuestionType = 'FRQ' | 'MCQ';

export interface RubricItem {
  id: string;
  question: string;
  maxPoints: number;
  criteria: string;
  type: QuestionType;
  correctAnswer?: string; // e.g., 'A', 'B', 'C', 'D'
}

export interface StudentSubmission {
  id: string;
  studentName: string;
  fileData: string | null; // Base64
  fileType: string;
  fileName: string;
  grades: Record<string, QuestionGrade>; // Keyed by RubricItem.id
  status: 'PENDING' | 'GRADED';
  totalScore: number;
}

export interface QuestionGrade {
  score: number;
  comment: string;
  studentAnswer?: string; // The detected answer (e.g. 'A')
  isAiSuggested?: boolean;
}

export interface Assessment {
  id: string;
  title: string;
  description: string;
  status: AssessmentStatus;
  rubric: RubricItem[];
  students: StudentSubmission[];
  cannedComments: string[];
  created: number;
}

export interface AiGradingResult {
  questionId: string;
  score: number;
  comment: string;
  studentAnswer?: string;
}