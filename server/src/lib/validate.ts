import { z } from 'zod';
import { badRequest } from './errors';
import { isValidDate, isValidTime, normalizeDateTime } from './dates';
import {
  EVENT_STATUSES,
  EVENT_TYPES,
  ORGANIZATION_TYPES,
  REPEAT_RULES,
  RESPONSIBILITY_STATUSES,
} from './types';

const dateString = z
  .string()
  .trim()
  .refine(isValidDate, 'Please provide a valid date in YYYY-MM-DD format.');

const timeString = z
  .string()
  .trim()
  .refine(isValidTime, 'Please provide a valid time in HH:MM format.');

const optionalTime = z.union([timeString, z.literal('')]).nullish();

const dueAt = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (value === null || value === undefined || value.trim() === '') return null;
    const normalized = normalizeDateTime(value);
    if (!normalized) throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        path: ['due_at'],
        message: 'Please provide a valid due date.',
      },
    ]);
    return normalized;
  });

const trimmedText = (max: number) => z.string().trim().max(max);

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Please enter your username or email.').max(200),
  password: z.string().min(1, 'Please enter your password.').max(300),
});

export const eventCreateSchema = z
  .object({
    title: trimmedText(180).min(1, 'An event needs a name.'),
    description: trimmedText(8000).default(''),
    event_type: z.enum(EVENT_TYPES as [string, ...string[]]).default('event'),
    organizer_id: z.coerce.number().int().positive().nullish(),
    organizer_name: trimmedText(120).default(''),
    event_date: dateString,
    start_time: optionalTime,
    end_time: optionalTime,
    all_day: z.coerce.boolean().default(false),
    location: trimmedText(160).default(''),
    status: z.enum(EVENT_STATUSES as [string, ...string[]]).default('planning'),
    important: z.coerce.boolean().default(false),
    is_public: z.coerce.boolean().default(true),
    repeat_rule: z.enum(REPEAT_RULES as [string, ...string[]]).default('none'),
    repeat_interval: z.coerce.number().int().min(1).max(52).default(1),
    repeat_until: z.union([dateString, z.literal('')]).nullish(),
    /** Set by the client after the conflict warning has been acknowledged. */
    override_conflicts: z.coerce.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (!value.all_day && value.start_time && value.end_time) {
      if (value.end_time <= value.start_time) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['end_time'],
          message: 'The end time must be after the start time.',
        });
      }
    }
    if (value.repeat_rule !== 'none' && value.repeat_until && value.repeat_until !== '') {
      if (value.repeat_until < value.event_date) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['repeat_until'],
          message: 'The repeat end date cannot be before the event date.',
        });
      }
    }
  });

export const eventUpdateSchema = z
  .object({
    title: trimmedText(180).min(1, 'An event needs a name.').optional(),
    description: trimmedText(8000).optional(),
    event_type: z.enum(EVENT_TYPES as [string, ...string[]]).optional(),
    organizer_id: z.coerce.number().int().positive().nullish(),
    organizer_name: trimmedText(120).optional(),
    event_date: dateString.optional(),
    start_time: optionalTime,
    end_time: optionalTime,
    all_day: z.coerce.boolean().optional(),
    location: trimmedText(160).optional(),
    status: z.enum(EVENT_STATUSES as [string, ...string[]]).optional(),
    important: z.coerce.boolean().optional(),
    is_public: z.coerce.boolean().optional(),
    override_conflicts: z.coerce.boolean().default(false),
  })
  .strip();

export const responsibilityCreateSchema = z.object({
  title: trimmedText(180).min(1, 'A responsibility needs a task name.'),
  assigned_user_id: z.coerce.number().int().positive().nullish(),
  assigned_team: trimmedText(120).default(''),
  note: trimmedText(2000).default(''),
  due_at: dueAt,
  status: z.enum(RESPONSIBILITY_STATUSES as [string, ...string[]]).default('not_started'),
  public_visibility: z.coerce.boolean().default(false),
  override_conflicts: z.coerce.boolean().default(false),
});

export const responsibilityUpdateSchema = z.object({
  title: trimmedText(180).min(1, 'A responsibility needs a task name.').optional(),
  assigned_user_id: z.coerce.number().int().positive().nullish(),
  assigned_team: trimmedText(120).optional(),
  note: trimmedText(2000).optional(),
  due_at: dueAt,
  status: z.enum(RESPONSIBILITY_STATUSES as [string, ...string[]]).optional(),
  public_visibility: z.coerce.boolean().optional(),
});

export const quickNoteCreateSchema = z.object({
  title: trimmedText(160).default(''),
  content: trimmedText(8000).default(''),
  pinned: z.coerce.boolean().default(false),
});

export const quickNoteUpdateSchema = z.object({
  title: trimmedText(160).optional(),
  content: trimmedText(8000).optional(),
  pinned: z.coerce.boolean().optional(),
  archived: z.coerce.boolean().optional(),
});

export const quickNoteConvertSchema = z.object({
  event_id: z.coerce.number().int().positive(),
  title: trimmedText(180).min(1, 'The task needs a name.'),
  assigned_team: trimmedText(120).default(''),
  assigned_user_id: z.coerce.number().int().positive().nullish(),
  note: trimmedText(2000).default(''),
  due_at: dueAt,
  public_visibility: z.coerce.boolean().default(false),
  archive_note: z.coerce.boolean().default(true),
});

export const eventNoteSchema = z.object({
  content: trimmedText(4000).min(1, 'The note cannot be empty.'),
});

export const organizationSchema = z.object({
  name: trimmedText(120).min(1, 'A name is required.'),
  type: z.enum(ORGANIZATION_TYPES as [string, ...string[]]),
  active: z.coerce.boolean().default(true),
  sort_order: z.coerce.number().int().min(0).max(9999).default(100),
});

export const venueSchema = z.object({
  name: trimmedText(120).min(1, 'A name is required.'),
  active: z.coerce.boolean().default(true),
});

export const staffAdminCreateSchema = z.object({
  name: trimmedText(120).min(1, 'A name is required.'),
  email: z.string().trim().toLowerCase().email('Please enter a valid email address.').max(200),
  password: z
    .string()
    .min(10, 'Use at least 10 characters for an administrator password.')
    .max(300),
});

export const staffAdminUpdateSchema = z.object({
  name: trimmedText(120).min(1, 'A name is required.').optional(),
  email: z.string().trim().toLowerCase().email('Please enter a valid email address.').max(200).optional(),
  password: z
    .string()
    .min(10, 'Use at least 10 characters for an administrator password.')
    .max(300)
    .optional(),
  active: z.coerce.boolean().optional(),
});

export const passwordChangeSchema = z.object({
  current_password: z.string().min(1, 'Please enter your current password.').max(300),
  new_password: z
    .string()
    .min(10, 'Use at least 10 characters for an administrator password.')
    .max(300),
});

/** Runs a zod schema and converts failures into a friendly AppError. */
export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body ?? {});
  if (result.success) return result.data;

  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || 'form';
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  const first = result.error.issues[0];
  throw badRequest(first?.message ?? 'Some of the details you entered are not valid.', fieldErrors);
}
