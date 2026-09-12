import type {
  AttachmentRow,
  EventRow,
  OrganizationRow,
  QuickNoteRow,
  ResponsibilityRow,
  Viewer,
} from './types';

export type ReadinessLabel = 'ready' | 'in_progress' | 'needs_attention';

export interface Readiness {
  total: number;
  completed: number;
  percent: number;
  label: ReadinessLabel;
}

/** Preparation progress for an event (spec 12). */
export function buildReadiness(total: number, completed: number): Readiness | null {
  if (total <= 0) return null;
  const percent = Math.round((completed / total) * 100);
  const label: ReadinessLabel =
    percent >= 90 ? 'ready' : percent >= 50 ? 'in_progress' : 'needs_attention';
  return { total, completed, percent, label };
}

export interface EventCounts {
  responsibility_total: number;
  responsibility_completed: number;
  public_responsibility_total: number;
  public_responsibility_completed: number;
  attachment_total: number;
  public_attachment_total: number;
  note_total: number;
}

export const emptyCounts: EventCounts = {
  responsibility_total: 0,
  responsibility_completed: 0,
  public_responsibility_total: 0,
  public_responsibility_completed: 0,
  attachment_total: 0,
  public_attachment_total: 0,
  note_total: 0,
};

/**
 * The single place where an event row becomes API output.
 *
 * Public viewers never receive internal fields. This is enforced here rather
 * than in the UI, because hiding a button is not access control (spec 40).
 */
export function serializeEvent(
  row: EventRow,
  viewer: Viewer | null,
  options: {
    organization?: Pick<OrganizationRow, 'id' | 'name' | 'type'> | null;
    counts?: EventCounts;
    creatorName?: string | null;
  } = {}
) {
  const counts = options.counts ?? emptyCounts;
  const isAdmin = viewer !== null;

  // Readiness always reflects every responsibility, for admins and students
  // alike. Deriving it from only the public subset would report an event as
  // "Ready" while internal work was still outstanding - a number that is
  // consistent with the list below it, but not true.
  const readiness = buildReadiness(counts.responsibility_total, counts.responsibility_completed);

  const base = {
    id: row.id,
    title: row.title,
    description: row.description,
    event_type: row.event_type,
    is_deadline: row.event_type === 'deadline',
    organizer: options.organization
      ? { id: options.organization.id, name: options.organization.name, type: options.organization.type }
      : null,
    organizer_name: options.organization?.name ?? row.organizer_name,
    source: options.organization?.type ?? 'other',
    event_date: row.event_date,
    start_time: row.all_day === 1 ? null : row.start_time,
    end_time: row.all_day === 1 ? null : row.end_time,
    all_day: row.all_day === 1,
    location: row.location,
    status: row.status,
    important: row.important === 1,
    readiness,
    // How much of the checklist is published, so the UI can say plainly that
    // a public viewer is seeing a subset rather than silently hiding rows.
    public_responsibility_count: counts.public_responsibility_total,
    attachment_count: isAdmin ? counts.attachment_total : counts.public_attachment_total,
  };

  if (!isAdmin) return base;

  return {
    ...base,
    is_public: row.is_public === 1,
    repeat_rule: row.repeat_rule,
    repeat_interval: row.repeat_interval,
    repeat_until: row.repeat_until,
    parent_event_id: row.parent_event_id,
    note_count: counts.note_total,
    created_by: row.created_by,
    created_by_name: options.creatorName ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    archived: row.deleted_at !== null,
  };
}

export type SerializedEvent = ReturnType<typeof serializeEvent>;

export function serializeResponsibility(
  row: ResponsibilityRow,
  viewer: Viewer | null,
  options: { assigneeName?: string | null; completedByName?: string | null } = {}
) {
  const assignedTo = row.assigned_team || options.assigneeName || 'Unassigned';

  if (!viewer) {
    // Public checklist: the task, who owns it, and whether it is done.
    return {
      id: row.id,
      event_id: row.event_id,
      title: row.title,
      assigned_to: assignedTo,
      status: row.status,
      public_visibility: true as const,
      note: row.note,
      due_at: row.due_at,
    };
  }

  return {
    id: row.id,
    event_id: row.event_id,
    title: row.title,
    assigned_to: assignedTo,
    assigned_user_id: row.assigned_user_id,
    assigned_user_name: options.assigneeName ?? null,
    assigned_team: row.assigned_team,
    note: row.note,
    due_at: row.due_at,
    status: row.status,
    public_visibility: row.public_visibility === 1,
    position: row.position,
    completed_by: row.completed_by,
    completed_by_name: options.completedByName ?? null,
    completed_at: row.completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function serializeQuickNote(row: QuickNoteRow) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    pinned: row.pinned === 1,
    archived: row.archived === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function serializeAttachment(row: AttachmentRow, uploaderName?: string | null) {
  return {
    id: row.id,
    event_id: row.event_id,
    file_name: row.file_name,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    public_visibility: row.public_visibility === 1,
    uploaded_by_name: uploaderName ?? null,
    created_at: row.created_at,
    download_url: `/api/attachments/${row.id}/download`,
  };
}

export function serializeOrganization(row: OrganizationRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    type: row.type,
    active: row.active === 1,
  };
}

export function serializeViewer(viewer: Viewer) {
  return {
    id: viewer.id,
    name: viewer.name,
    email: viewer.email,
    role: viewer.role,
    is_super_admin: viewer.role === 'super_admin',
  };
}
