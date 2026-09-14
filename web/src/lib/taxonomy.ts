import type {
  CalendarEvent,
  EventStatus,
  EventType,
  Readiness,
  ResponsibilityStatus,
  SourceType,
} from '../api/types';

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  event: 'Event',
  meeting: 'Meeting',
  workshop: 'Workshop',
  seminar: 'Seminar',
  deadline: 'Deadline',
  competition: 'Competition',
  academic: 'Academic',
  examination: 'Examination',
  faculty: 'Faculty',
  other: 'Other',
};

export const STATUS_LABELS: Record<EventStatus, string> = {
  planning: 'Planning',
  confirmed: 'Confirmed',
  ongoing: 'Ongoing',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const SOURCE_LABELS: Record<SourceType, string> = {
  institution: 'MRTC',
  department: 'Department',
  club: 'Club',
  academic: 'Academic',
  other: 'Other',
};

export const RESPONSIBILITY_STATUS_LABELS: Record<ResponsibilityStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
};

export const READINESS_LABELS: Record<Readiness['label'], string> = {
  ready: 'Ready',
  in_progress: 'In progress',
  needs_attention: 'Needs attention',
};

/**
 * Colour carries meaning, not decoration (spec 33): where an event comes from,
 * what state it is in, and how ready it is.
 *
 * Every value is a theme token, so light and dark are two designed palettes
 * rather than one inverted set, and the whole scale can be retuned in one file.
 * MRTC's own events take the brand colour - near-black in light, white in dark -
 * because the institution is the brand; the clubs and departments take the
 * accent ramp beside it.
 */
const SOURCE_ACCENT: Record<SourceType, string> = {
  institution: 'bg-src-institution',
  department: 'bg-src-department',
  academic: 'bg-src-academic',
  club: 'bg-src-club',
  other: 'bg-src-other',
};

const SOURCE_PILL: Record<SourceType, string> = {
  institution: 'border-transparent bg-src-institution-wash text-src-institution-text',
  department: 'border-transparent bg-src-department-wash text-src-department-text',
  academic: 'border-transparent bg-src-academic-wash text-src-academic-text',
  club: 'border-transparent bg-src-club-wash text-src-club-text',
  other: 'border-transparent bg-src-other-wash text-src-other-text',
};

const DEADLINE_ACCENT = 'bg-src-deadline';
const DEADLINE_PILL = 'border-transparent bg-src-deadline-wash text-src-deadline-text';

/** The colour bar / dot for an event, deadlines taking precedence. */
export function eventAccent(event: Pick<CalendarEvent, 'source' | 'event_type'>): string {
  if (event.event_type === 'deadline') return DEADLINE_ACCENT;
  return SOURCE_ACCENT[event.source] ?? SOURCE_ACCENT.other;
}

export function eventPill(event: Pick<CalendarEvent, 'source' | 'event_type'>): string {
  if (event.event_type === 'deadline') return DEADLINE_PILL;
  return SOURCE_PILL[event.source] ?? SOURCE_PILL.other;
}

export function sourcePill(source: SourceType): string {
  return SOURCE_PILL[source] ?? SOURCE_PILL.other;
}

export const STATUS_PILL: Record<EventStatus, string> = {
  planning: 'border-hairline bg-raised text-muted',
  confirmed: 'border-transparent bg-success-wash text-success-text',
  ongoing: 'border-transparent bg-attention-wash text-attention-text',
  completed: 'border-hairline bg-transparent text-faint',
  cancelled: 'border-transparent bg-error-wash text-error-text line-through',
};

export const READINESS_BAR: Record<Readiness['label'], string> = {
  ready: 'bg-success',
  in_progress: 'bg-attention',
  needs_attention: 'bg-error',
};

export const READINESS_TEXT: Record<Readiness['label'], string> = {
  ready: 'text-success-text',
  in_progress: 'text-attention-text',
  needs_attention: 'text-error-text',
};

export const READINESS_DOT: Record<Readiness['label'], string> = {
  ready: '\u{1F7E2}',
  in_progress: '\u{1F7E1}',
  needs_attention: '\u{1F534}',
};

/** Options for the Source filter (spec 20). */
export const SOURCE_FILTERS: Array<{ value: '' | SourceType; label: string }> = [
  { value: '', label: 'All sources' },
  { value: 'institution', label: 'MRTC' },
  { value: 'club', label: 'Clubs' },
  { value: 'department', label: 'Departments' },
  { value: 'academic', label: 'Academic' },
  { value: 'other', label: 'Other' },
];

export const EVENT_TYPE_FILTERS: Array<{ value: '' | EventType; label: string }> = [
  { value: '', label: 'All types' },
  { value: 'event', label: 'Event' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'workshop', label: 'Workshop' },
  { value: 'seminar', label: 'Seminar' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'competition', label: 'Competition' },
  { value: 'academic', label: 'Academic' },
  { value: 'examination', label: 'Examination' },
  { value: 'faculty', label: 'Faculty' },
  { value: 'other', label: 'Other' },
];

export const STATUS_FILTERS: Array<{ value: '' | EventStatus; label: string }> = [
  { value: '', label: 'Any status' },
  { value: 'planning', label: 'Planning' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

/** Turns an activity log row into a sentence (spec 25). */
export function describeActivity(
  action: string,
  metadata: Record<string, unknown>,
  actorName: string | null,
  isYou: boolean
): string {
  const who = isYou ? 'You' : actorName ?? 'An administrator';
  const value = (key: string): string => {
    const raw = metadata[key];
    return raw === undefined || raw === null || raw === '' ? '' : String(raw);
  };

  switch (action) {
    case 'event.created':
      return `${who} created this event.`;
    case 'event.updated':
      return `${who} updated this event.`;
    case 'event.renamed':
      return `${who} renamed the event to "${value('to')}".`;
    case 'event.location_changed':
      return `${who} changed the location to ${value('to') || 'no location'}.`;
    case 'event.date_changed':
      return `${who} moved the event to ${value('to')}.`;
    case 'event.time_changed':
      return `${who} changed the timing.`;
    case 'event.status_changed':
      return `${who} set the status to ${value('to')}.`;
    case 'event.importance_changed':
      return metadata.important === true
        ? `${who} marked this event important.`
        : `${who} removed the important flag.`;
    case 'event.visibility_changed':
      return metadata.is_public === true
        ? `${who} made this event public.`
        : `${who} made this event internal.`;
    case 'event.archived':
      return `${who} archived this event.`;
    case 'event.restored':
      return `${who} restored this event.`;
    case 'event.duplicated':
      return `${who} created this event by duplicating "${value('source_title')}".`;
    case 'responsibility.created':
      return `${who} added the "${value('title')}" responsibility.`;
    case 'responsibility.created_from_note':
      return `${who} turned a note into the "${value('title')}" responsibility.`;
    case 'responsibility.completed':
      return value('assigned_to')
        ? `${who} marked "${value('title')}" complete for ${value('assigned_to')}.`
        : `${who} marked "${value('title')}" complete.`;
    case 'responsibility.reopened':
      return `${who} reopened "${value('title')}".`;
    case 'responsibility.updated':
      return `${who} updated "${value('title')}".`;
    case 'responsibility.removed':
      return `${who} removed "${value('title')}".`;
    case 'event_note.added':
      return `${who} added an event note.`;
    case 'event_note.updated':
      return `${who} edited an event note.`;
    case 'event_note.removed':
      return `${who} removed an event note.`;
    case 'attachment.added':
      return `${who} attached ${value('file_name')}.`;
    case 'attachment.removed':
      return `${who} removed ${value('file_name')}.`;
    case 'attachment.visibility_changed':
      return metadata.is_public === true
        ? `${who} published ${value('file_name')} to the public page.`
        : `${who} made ${value('file_name')} internal.`;
    case 'admin.signed_in':
      return `${who} signed in.`;
    case 'admin.password_changed':
      return `${who} changed their password.`;
    case 'admin.staff_created':
      return `${who} added the staff admin ${value('email')}.`;
    case 'admin.staff_updated':
      return `${who} updated the staff admin ${value('email')}.`;
    case 'admin.staff_deactivated':
      return `${who} deactivated the staff admin ${value('email')}.`;
    case 'organization.created':
      return `${who} added "${value('name')}".`;
    case 'organization.updated':
      return `${who} updated "${value('name')}".`;
    case 'organization.deactivated':
      return `${who} deactivated "${value('name')}".`;
    case 'organization.removed':
      return `${who} removed "${value('name')}".`;
    case 'venue.created':
      return `${who} added the venue "${value('name')}".`;
    case 'venue.updated':
      return `${who} updated the venue "${value('name')}".`;
    case 'venue.removed':
      return `${who} removed the venue "${value('name')}".`;
    default:
      return `${who} made a change.`;
  }
}
