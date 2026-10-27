/**
 * Code Assistant MVP Types
 * Strict preview-only structures without filesystem or runtime execution.
 */

export type CodeAssistantWorkflowState =
  | 'idle'
  | 'thinking'
  | 'needs_clarification'
  | 'plan_ready'
  | 'generating_code'
  | 'preview_ready'
  | 'approved'
  | 'rejected'
  | 'error';

export interface ClarifyingQuestion {
  id: string;
  question: string;
  options: string[];
}

export interface ProposedFile {
  name: string;
  path: string;
  language: string;
  code: string;
  description: string;
}

export interface ImplementationPlan {
  summary: string;
  steps: string[];
  affectedFiles: string[];
  suggestedDependencies: string[];
  risksAndNotes: string[];
  proposedFiles: ProposedFile[];
}

export interface CodeAssistantActivity {
  id: string;
  timestamp: string;
  type:
    | 'request_created'
    | 'clarification_requested'
    | 'plan_generated'
    | 'preview_generated'
    | 'code_copied'
    | 'file_downloaded'
    | 'export_approved'
    | 'changes_rejected';
  message: string;
}
