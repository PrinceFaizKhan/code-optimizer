import { z } from 'zod';

export const LANGUAGES = ['php', 'javascript', 'typescript', 'python', 'sql', 'blade'] as const;
export type Language = (typeof LANGUAGES)[number];
export const LanguageSchema = z.enum(LANGUAGES);

export const SEVERITIES = ['low', 'medium', 'high'] as const;
export type Severity = (typeof SEVERITIES)[number];
export const SeveritySchema = z.enum(SEVERITIES);

export const IssueSchema = z.object({
  title: z.string(),
  severity: SeveritySchema,
  description: z.string(),
  line_reference: z.string(),
});
export type Issue = z.infer<typeof IssueSchema>;

export const ImprovementSchema = z.object({
  title: z.string(),
  description: z.string(),
  impact: z.string(),
});
export type Improvement = z.infer<typeof ImprovementSchema>;

export const BugSchema = z.object({
  title: z.string(),
  severity: SeveritySchema,
  description: z.string(),
});
export type Bug = z.infer<typeof BugSchema>;

export const ChangeSchema = z.object({
  change: z.string(),
  why: z.string(),
});
export type Change = z.infer<typeof ChangeSchema>;

export const OptimizationResultSchema = z.object({
  optimized_code: z.string(),
  quality_score: z.number().int().min(0).max(100),
  no_optimization_needed: z.boolean(),
  summary: z.string(),
  issues_found: z.array(IssueSchema),
  performance_improvements: z.array(ImprovementSchema),
  potential_bugs: z.array(BugSchema),
  explanation_of_changes: z.array(ChangeSchema),
});
export type OptimizationResult = z.infer<typeof OptimizationResultSchema>;

export const MAX_CODE_CHARS = 60_000;
