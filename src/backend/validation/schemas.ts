import { z } from 'zod';

/**
 * Zod Validation Schemas for Server Actions and Data Mutation
 * Enforces strict allowlists and rejects unpermitted fields to prevent mass assignment.
 */

export const profileUpdateSchema = z
  .object({
    full_name: z.string().trim().max(100).optional(),
    avatar_url: z.string().url().max(500).optional().or(z.literal('')),
  })
  .strict();

export const notificationPreferencesSchema = z
  .object({
    task_assigned: z.boolean().optional(),
    task_completed: z.boolean().optional(),
    agent_offline: z.boolean().optional(),
    agent_errors: z.boolean().optional(),
    weekly_digest: z.boolean().optional(),
    product_updates: z.boolean().optional(),
  })
  .strict();

export const taskCreateSchema = z
  .object({
    workspace_id: z.string().uuid(),
    title: z.string().trim().min(1).max(255),
    description: z.string().trim().max(2000).optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    assigned_agent_id: z.string().uuid().optional().nullable(),
  })
  .strict();

export const taskUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().max(2000).optional().nullable(),
    status: z.enum(['queued', 'assigned', 'in_progress', 'completed', 'failed', 'cancelled']).optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    progress: z.number().int().min(0).max(100).optional(),
    assigned_agent_id: z.string().uuid().optional().nullable(),
  })
  .strict();

export const agentEventCreateSchema = z
  .object({
    workspace_id: z.string().uuid(),
    agent_id: z.string().uuid().optional().nullable(),
    task_id: z.string().uuid().optional().nullable(),
    event_type: z.string().trim().min(1).max(50),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const workspaceMemberRoleUpdateSchema = z
  .object({
    workspace_id: z.string().uuid(),
    user_id: z.string().uuid(),
    role: z.enum(['admin', 'member']), // Owner role cannot be assigned via standard update
  })
  .strict();
