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

export type SourceType = 'institution' | 'department' | 'club' | 'academic' | 'other';

export type ResponsibilityStatus = 'not_started' | 'in_progress' | 'completed';

export type RepeatRule = 'none' | 'daily' | 'weekly' | 'monthly' | 'custom';

export interface Readiness {
  total: number;
  completed: number;
  percent: number;
  label: 'ready' | 'in_progress' | 'needs_attention';
}

export interface Organizer {
  id: number;
  name: string;
  type: SourceType;
}

/** The public shape. Admin-only fields are optional and absent for viewers. */
export interface CalendarEvent {
  id: number;
  title: string;
  description: string;
  event_type: EventType;
  is_deadline: boolean;
  organizer: Organizer | null;
  organizer_name: string;
  source: SourceType;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  all_day: boolean;
  location: string;
  status: EventStatus;
  important: boolean;
  readiness: Readiness | null;
  public_responsibility_count: number;
  attachment_count: number;

  // Present only when an administrator is signed in.
  is_public?: boolean;
  repeat_rule?: RepeatRule;
  repeat_interval?: number;
  repeat_until?: string | null;
  parent_event_id?: number | null;
  note_count?: number;
  created_by?: number | null;
  created_by_name?: string | null;
  created_at?: string;
  updated_at?: string;
  archived?: boolean;
}

export interface Responsibility {
  id: number;
  event_id: number;
  title: string;
  assigned_to: string;
  status: ResponsibilityStatus;
  note: string;
  due_at: string | null;
  public_visibility: boolean;

  assigned_user_id?: number | null;
  assigned_user_name?: string | null;
  assigned_team?: string;
  position?: number;
  completed_by?: number | null;
  completed_by_name?: string | null;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface TaskWithEvent extends Responsibility {
  event: {
    id: number;
    title: string;
    event_date: string;
    start_time?: string | null;
    status?: EventStatus;
  };
}

export interface EventNote {
  id: number;
  event_id: number;
  content: string;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  author_name: string | null;
}

export interface Attachment {
  id: number;
  event_id: number;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  public_visibility: boolean;
  uploaded_by_name: string | null;
  created_at: string;
  download_url: string;
}

export interface ActivityEntry {
  id: number;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
  user_id?: number | null;
  user_name: string | null;
  event_id?: number | null;
  event_title?: string | null;
}

export interface QuickNote {
  id: number;
  title: string;
  content: string;
  pinned: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Viewer {
  id: number;
  name: string;
  email: string;
  role: Role;
  is_super_admin: boolean;
}

export interface EventDetail {
  event: CalendarEvent;
  responsibilities: Responsibility[];
  attachments: Attachment[];
  notes?: EventNote[];
  activity?: ActivityEntry[];
}

export interface EventListResponse {
  events: CalendarEvent[];
  page: { total: number; limit: number; offset: number; has_more: boolean };
}

export interface OverviewResponse {
  today: string;
  today_events: CalendarEvent[];
  upcoming_events: CalendarEvent[];
  deadlines: CalendarEvent[];
  important_events: CalendarEvent[];
  admin?: {
    stats: {
      events_today: number;
      my_open_tasks: number;
      pending_responsibilities_today: number;
      deadlines_next_14_days: number;
    };
    my_tasks: TaskWithEvent[];
    readiness: Array<{
      event_id: number;
      title: string;
      event_date: string;
      readiness: Readiness | null;
    }>;
  };
}

export interface MetaResponse {
  organizations: Array<{ id: number; name: string; slug: string; type: SourceType; active: boolean }>;
  venues: Array<{ id: number; name: string; active: boolean }>;
  locations: string[];
  taxonomy: {
    event_types: EventType[];
    event_statuses: EventStatus[];
    organization_types: SourceType[];
    responsibility_statuses: ResponsibilityStatus[];
    repeat_rules: RepeatRule[];
  };
}

export interface AssigneesResponse {
  teams: string[];
  admins: Array<{ id: number; name: string; role: Role; is_you: boolean }>;
}

export interface SearchResponse {
  query: string;
  events: CalendarEvent[];
  responsibilities: Array<{
    id: number;
    title: string;
    assigned_team: string;
    note: string;
    status: ResponsibilityStatus;
    due_at: string | null;
    event_id: number;
    event_title: string;
    event_date: string;
  }>;
  organizations: Array<{ id: number; name: string; type: SourceType }>;
  notes: QuickNote[];
}

export interface VenueConflict {
  kind: 'venue';
  event_id: number;
  title: string;
  location: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  all_day: boolean;
}

export interface TeamConflict {
  kind: 'team';
  team: string;
  event_id: number;
  event_title: string;
  responsibility_title: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
}

export type Conflict = VenueConflict | TeamConflict;

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  created_at: string;
}
