export type Role = 'super_admin' | 'staff_admin';

export type EventType =
  | 'event'
  | 'meeting'
  | 'workshop'
  | 'seminar'
  | 'deadline'
  | 'competition'
  | 'academic'
  | 'examination'
  | 'faculty'
  | 'other';

export type EventStatus = 'planning' | 'confirmed' | 'ongoing' | 'completed' | 'cancelled';

export type OrganizationType = 'institution' | 'department' | 'club' | 'academic' | 'other';

export type ResponsibilityStatus = 'not_started' | 'in_progress' | 'completed';

export type RepeatRule = 'none' | 'daily' | 'weekly' | 'monthly' | 'custom';

export const EVENT_TYPES: EventType[] = [
  'event',
  'meeting',
  'workshop',
  'seminar',
  'deadline',
  'competition',
  'academic',
  'examination',
  'faculty',
  'other',
];

export const EVENT_STATUSES: EventStatus[] = [
  'planning',
  'confirmed',
  'ongoing',
  'completed',
  'cancelled',
];

export const ORGANIZATION_TYPES: OrganizationType[] = [
  'institution',
  'department',
  'club',
  'academic',
  'other',
];

export const RESPONSIBILITY_STATUSES: ResponsibilityStatus[] = [
  'not_started',
  'in_progress',
  'completed',
];

export const REPEAT_RULES: RepeatRule[] = ['none', 'daily', 'weekly', 'monthly', 'custom'];

export interface UserRow {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: Role;
  active: number;
  created_at: string;
  updated_at: string;
}

/** The authenticated principal attached to a request. */
export interface Viewer {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface EventRow {
  id: number;
  title: string;
  description: string;
  event_type: EventType;
  organizer_id: number | null;
  organizer_name: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  all_day: number;
  location: string;
  status: EventStatus;
  important: number;
  is_public: number;
  repeat_rule: RepeatRule;
  repeat_interval: number;
  repeat_until: string | null;
  parent_event_id: number | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ResponsibilityRow {
  id: number;
  event_id: number;
  title: string;
  assigned_user_id: number | null;
  assigned_team: string;
  note: string;
  due_at: string | null;
  status: ResponsibilityStatus;
  public_visibility: number;
  position: number;
  completed_by: number | null;
  completed_at: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface QuickNoteRow {
  id: number;
  user_id: number;
  title: string;
  content: string;
  pinned: number;
  archived: number;
  created_at: string;
  updated_at: string;
}

export interface OrganizationRow {
  id: number;
  name: string;
  slug: string;
  type: OrganizationType;
  active: number;
  sort_order: number;
  created_at: string;
}

export interface VenueRow {
  id: number;
  name: string;
  active: number;
  created_at: string;
}

export interface AttachmentRow {
  id: number;
  event_id: number;
  file_name: string;
  stored_name: string;
  mime_type: string;
  size_bytes: number;
  public_visibility: number;
  uploaded_by: number | null;
  created_at: string;
}
