import { config } from '../config';
import { getDb } from './index';
import { addDays, todayISO } from '../lib/dates';
import { hashPassword } from '../lib/password';
import type { OrganizationType, ResponsibilityStatus } from '../lib/types';

interface SeedOrganization {
  name: string;
  type: OrganizationType;
  sort: number;
}

const ORGANIZATIONS: SeedOrganization[] = [
  { name: 'MRTC', type: 'institution', sort: 0 },
  { name: 'Academic Office', type: 'academic', sort: 10 },
  { name: 'Examination Cell', type: 'academic', sort: 11 },
  { name: 'Faculty Council', type: 'department', sort: 20 },
  { name: 'Computer Science Department', type: 'department', sort: 21 },
  { name: 'Electronics Department', type: 'department', sort: 22 },
  { name: 'Mechanical Department', type: 'department', sort: 23 },
  { name: 'Cultural Club', type: 'club', sort: 30 },
  { name: 'Technical Club', type: 'club', sort: 31 },
  { name: 'Media Club', type: 'club', sort: 32 },
  { name: 'Film Club', type: 'club', sort: 33 },
  { name: 'I&E Club', type: 'club', sort: 34 },
  { name: 'Sports Club', type: 'club', sort: 35 },
  { name: "Women's Club", type: 'club', sort: 36 },
  { name: 'Financial Literacy Club', type: 'club', sort: 37 },
  { name: 'Student Council', type: 'other', sort: 40 },
  { name: 'Maintenance Team', type: 'other', sort: 41 },
];

const VENUES = [
  'Seminar Hall',
  'Auditorium',
  'Conference Room',
  'Media Room',
  'Ground',
  'Classroom Block A',
  'Library Hall',
  'Online',
];

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/&/g, '-and-')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'organization'
  );
}

/**
 * Creates the administrator accounts, the organiser/venue lists and (optionally)
 * a realistic set of demo events the first time the database is created.
 * Safe to call on every boot: it does nothing once seeded.
 */
export function ensureSeedData(): void {
  const db = getDb();

  const alreadySeeded = db.prepare(`SELECT value FROM settings WHERE key = 'seeded_at'`).get() as
    | { value: string }
    | undefined;
  if (alreadySeeded) return;

  const seed = db.transaction(() => {
    seedUsers();
    seedOrganizations();
    seedVenues();
    if (config.seed.demoData) seedDemoEvents();

    db.prepare(`INSERT INTO settings (key, value) VALUES ('seeded_at', ?)`).run(
      new Date().toISOString()
    );
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('schema_version', '1')`).run();
  });

  seed();

  console.log('[mrtc-calendar] database prepared.');
  console.log(`[mrtc-calendar] super admin: ${config.seed.superAdmin.email}`);
  for (const staff of config.seed.staff) {
    console.log(`[mrtc-calendar] staff admin: ${staff.email}`);
  }
  if (!config.isProduction) {
    console.log('[mrtc-calendar] seed passwords come from .env - change them before going live.');
  }
}

function seedUsers(): void {
  const db = getDb();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO users (name, email, password_hash, role, active)
     VALUES (?, ?, ?, ?, 1)`
  );

  insert.run(
    config.seed.superAdmin.name,
    config.seed.superAdmin.email,
    hashPassword(config.seed.superAdmin.password),
    'super_admin'
  );

  // Exactly two staff admin accounts (spec 2).
  for (const staff of config.seed.staff.slice(0, 2)) {
    insert.run(staff.name, staff.email, hashPassword(staff.password), 'staff_admin');
  }
}

function seedOrganizations(): void {
  const insert = getDb().prepare(
    `INSERT OR IGNORE INTO organizations (name, slug, type, active, sort_order)
     VALUES (?, ?, ?, 1, ?)`
  );
  for (const org of ORGANIZATIONS) {
    insert.run(org.name, slugify(org.name), org.type, org.sort);
  }
}

function seedVenues(): void {
  const insert = getDb().prepare(`INSERT OR IGNORE INTO venues (name, active) VALUES (?, 1)`);
  for (const venue of VENUES) insert.run(venue);
}

interface DemoResponsibility {
  title: string;
  /** Team or club that owns the task. Empty when a named admin owns it. */
  team: string;
  /** Assigns the task to an administrator account, so My Tasks is populated. */
  assignTo?: 'super' | 'staff1' | 'staff2';
  note?: string;
  status?: ResponsibilityStatus;
  isPublic?: boolean;
  dueOffsetDays?: number;
  dueTime?: string;
}

interface DemoEvent {
  title: string;
  description?: string;
  type: string;
  organizer: string;
  offsetDays: number;
  start?: string;
  end?: string;
  allDay?: boolean;
  location: string;
  status?: string;
  important?: boolean;
  isPublic?: boolean;
  responsibilities?: DemoResponsibility[];
  notes?: string[];
}

function seedDemoEvents(): void {
  const db = getDb();
  const today = todayISO();

  const orgIds = new Map(
    (db.prepare('SELECT id, name FROM organizations').all() as Array<{ id: number; name: string }>).map(
      (row) => [row.name, row.id]
    )
  );
  const superAdmin = db
    .prepare(`SELECT id FROM users WHERE role = 'super_admin' LIMIT 1`)
    .get() as { id: number } | undefined;
  const staffAdmins = db
    .prepare(`SELECT id FROM users WHERE role = 'staff_admin' ORDER BY id`)
    .all() as Array<{ id: number }>;
  const staffAdmin = staffAdmins[0];

  const authorId = superAdmin?.id ?? null;
  const assigneeIds: Record<'super' | 'staff1' | 'staff2', number | null> = {
    super: superAdmin?.id ?? null,
    staff1: staffAdmins[0]?.id ?? null,
    staff2: staffAdmins[1]?.id ?? null,
  };

  const demo: DemoEvent[] = [
    {
      title: 'Department Meeting',
      description: 'Monthly review of department activities, results and upcoming plans.',
      type: 'meeting',
      organizer: 'Computer Science Department',
      offsetDays: 0,
      start: '10:00',
      end: '11:00',
      location: 'Conference Room',
      status: 'confirmed',
      responsibilities: [
        { title: 'Circulate agenda', team: 'Computer Science Department', status: 'completed' },
        { title: 'Projector setup', team: 'Maintenance Team', note: 'Ready by 9:45 AM.' },
      ],
    },
    {
      title: 'Technical Club Activity',
      description: 'Weekly hands-on session. Bring your laptop.',
      type: 'event',
      organizer: 'Technical Club',
      offsetDays: 0,
      start: '12:30',
      end: '14:00',
      location: 'Seminar Hall',
      status: 'confirmed',
      responsibilities: [
        { title: 'Attendance sheet', team: 'Technical Club', status: 'completed', isPublic: true },
        { title: 'Wi-Fi check', team: 'Maintenance Team', status: 'in_progress' },
      ],
    },
    {
      title: 'Media Planning',
      description: 'Plan coverage, reels and photography for the coming fortnight.',
      type: 'meeting',
      organizer: 'Media Club',
      offsetDays: 0,
      start: '16:00',
      end: '17:00',
      location: 'Media Room',
      status: 'confirmed',
    },
    {
      title: 'MRTC Technical Workshop',
      description:
        'Introduction to competitive programming: problem solving patterns, complexity and a live contest at the end of the session.',
      type: 'workshop',
      organizer: 'Technical Club',
      offsetDays: 3,
      start: '16:00',
      end: '18:00',
      location: 'Seminar Hall',
      status: 'confirmed',
      important: true,
      responsibilities: [
        {
          title: 'Venue Setup',
          team: 'Maintenance Team',
          note: 'Complete by 8:00 AM.',
          status: 'completed',
          isPublic: true,
        },
        {
          title: 'Photography',
          team: 'Media Club',
          note: 'Photos plus a 30 second reel for the workshop.',
          status: 'completed',
          isPublic: true,
        },
        { title: 'Speaker confirmation', team: 'Technical Club', status: 'completed' },
        { title: 'Refreshments', team: 'Student Council', status: 'completed' },
        { title: 'Registration desk', team: 'Technical Club', status: 'completed', isPublic: true },
        { title: 'Problem set review', team: 'Computer Science Department', status: 'completed' },
        { title: 'Projector and audio test', team: 'Maintenance Team', status: 'completed' },
        {
          title: 'Certificates',
          team: 'Cultural Club',
          note: 'Print 150 certificates.',
          status: 'in_progress',
        },
        { title: 'Feedback form', team: 'Technical Club', note: 'Share the QR code at the end.' },
        { title: 'Decoration', team: 'Cultural Club', note: 'Stage and entrance decoration.' },
        {
          title: 'Confirm photographer arrival',
          team: '',
          assignTo: 'staff1',
          note: 'Call by 8 AM.',
          dueOffsetDays: 3,
          dueTime: '08:00',
        },
      ],
      notes: ['Sir requested that the final poster be approved before publishing.'],
    },
    {
      title: 'Technical Hackathon - Registration Deadline',
      description: 'Last date for team registration. Teams of up to four students.',
      type: 'deadline',
      organizer: 'Technical Club',
      offsetDays: 3,
      start: '23:59',
      location: 'Online',
      status: 'confirmed',
      important: true,
      responsibilities: [
        { title: 'Publish registration link', team: 'Technical Club', status: 'completed', isPublic: true },
        { title: 'Shortlist teams', team: 'Technical Club', note: 'Share the final list with the office.' },
        {
          title: 'Approve the final poster',
          team: '',
          assignTo: 'super',
          note: 'Sir wants to see it before it goes out.',
          dueOffsetDays: 2,
          dueTime: '17:00',
        },
      ],
    },
    {
      title: 'Event Proposal Submission',
      description: 'Submit the annual cultural fest proposal to the academic office.',
      type: 'deadline',
      organizer: 'Cultural Club',
      offsetDays: 5,
      allDay: true,
      location: 'Academic Office',
      status: 'planning',
    },
    {
      title: 'Freshers Event',
      description:
        'Welcome programme for the incoming batch: introductions, performances and the club fair.',
      type: 'event',
      organizer: 'Student Council',
      offsetDays: 12,
      start: '09:30',
      end: '13:30',
      location: 'Auditorium',
      status: 'planning',
      important: true,
      responsibilities: [
        { title: 'Book the auditorium', team: 'Student Council', status: 'completed' },
        { title: 'Invitation to faculty', team: 'Faculty Council', status: 'completed' },
        { title: 'Anchor script', team: 'Cultural Club', status: 'completed', isPublic: true },
        { title: 'Sound and lighting', team: 'Maintenance Team', status: 'completed' },
        { title: 'Photography', team: 'Media Club', note: 'Cover the club fair as well.', isPublic: true },
        { title: 'Stage decoration', team: 'Cultural Club', status: 'in_progress' },
        { title: 'Refreshments', team: 'Student Council' },
        { title: 'Club fair stalls', team: 'I&E Club' },
        { title: 'Registration desk', team: 'Women\'s Club', isPublic: true },
        { title: 'Certificates and mementos', team: 'Cultural Club' },
        { title: 'Seating plan', team: 'Student Council', note: 'Reserve the first two rows for faculty.' },
        { title: 'Cleanup crew', team: 'Maintenance Team' },
        {
          title: 'Confirm venue booking',
          team: '',
          assignTo: 'staff1',
          note: 'Written confirmation from the office.',
          dueOffsetDays: 6,
          dueTime: '16:00',
        },
        {
          title: 'Finalise certificates',
          team: '',
          assignTo: 'staff2',
          note: 'Cultural Club will supply the design.',
          dueOffsetDays: 9,
          dueTime: '18:00',
        },
      ],
    },
    {
      title: 'Independence Day Celebration',
      description: 'Flag hoisting, cultural performances and the annual address.',
      type: 'event',
      organizer: 'MRTC',
      offsetDays: -14,
      start: '08:00',
      end: '10:30',
      location: 'Ground',
      status: 'completed',
      important: true,
      responsibilities: [
        { title: 'Flag arrangement', team: 'Maintenance Team', status: 'completed', isPublic: true },
        { title: 'Chief guest invitation', team: 'MRTC', status: 'completed' },
        { title: 'Cultural performances', team: 'Cultural Club', status: 'completed', isPublic: true },
        { title: 'Photography', team: 'Media Club', status: 'completed', isPublic: true },
        { title: 'Sound system', team: 'Maintenance Team', status: 'completed' },
        { title: 'Seating', team: 'Student Council', status: 'completed' },
        { title: 'Refreshments', team: 'Student Council', status: 'completed' },
        { title: 'Sports events', team: 'Sports Club', status: 'completed' },
        { title: 'Report for the website', team: 'Media Club', status: 'completed' },
        { title: 'Thank you notes', team: 'MRTC', status: 'completed' },
        { title: 'Ground cleanup', team: 'Maintenance Team', status: 'completed' },
        { title: 'Expense settlement', team: 'Financial Literacy Club', status: 'completed' },
      ],
    },
    {
      title: 'Mid Semester Examinations Begin',
      description: 'Examination schedule and seating plans are on the notice board.',
      type: 'examination',
      organizer: 'Examination Cell',
      offsetDays: 20,
      allDay: true,
      location: 'Classroom Block A',
      status: 'confirmed',
      important: true,
    },
    {
      title: 'Film Club Screening',
      description: 'Screening followed by an open discussion.',
      type: 'event',
      organizer: 'Film Club',
      offsetDays: 7,
      start: '17:30',
      end: '20:00',
      location: 'Seminar Hall',
      status: 'confirmed',
      responsibilities: [
        { title: 'Projector and speakers', team: 'Maintenance Team', status: 'in_progress' },
        { title: 'Poster design', team: 'Media Club', note: 'Needs final version before Friday.' },
        {
          title: 'Get the event photos',
          team: '',
          assignTo: 'staff1',
          note: 'Collect from Media Club the next morning.',
        },
      ],
    },
    {
      title: 'Entrepreneurship Seminar',
      description: 'Guest session on taking a student project to a first customer.',
      type: 'seminar',
      organizer: 'I&E Club',
      offsetDays: 9,
      start: '11:00',
      end: '13:00',
      location: 'Auditorium',
      status: 'confirmed',
      responsibilities: [
        { title: 'Speaker travel', team: 'I&E Club', status: 'completed' },
        { title: 'Publicity', team: 'Media Club', status: 'in_progress', isPublic: true },
        { title: 'Hall booking confirmation', team: 'Maintenance Team' },
        {
          title: 'Share the speaker brief',
          team: '',
          assignTo: 'super',
          note: 'Two slides on what MRTC does.',
          dueOffsetDays: 8,
          dueTime: '12:00',
        },
      ],
    },
    {
      title: 'Inter-College Sports Meet',
      description: 'Athletics, football and volleyball fixtures across three days.',
      type: 'competition',
      organizer: 'Sports Club',
      offsetDays: 26,
      allDay: true,
      location: 'Ground',
      status: 'planning',
    },
    {
      title: 'Financial Literacy Session',
      description: 'Budgeting and saving basics for first year students.',
      type: 'workshop',
      organizer: 'Financial Literacy Club',
      offsetDays: 14,
      start: '15:00',
      end: '16:30',
      location: 'Library Hall',
      status: 'planning',
    },
    {
      title: "Women's Club Planning Meeting",
      description: 'Internal planning for the awareness drive.',
      type: 'meeting',
      organizer: "Women's Club",
      offsetDays: 4,
      start: '14:00',
      end: '15:00',
      location: 'Conference Room',
      status: 'confirmed',
      isPublic: false,
    },
    {
      title: 'Faculty Development Programme',
      description: 'Two day programme on outcome based education.',
      type: 'faculty',
      organizer: 'Faculty Council',
      offsetDays: 17,
      allDay: true,
      location: 'Seminar Hall',
      status: 'confirmed',
    },
    {
      title: 'Academic Calendar Review',
      description: 'Review of the semester plan with department heads.',
      type: 'academic',
      organizer: 'Academic Office',
      offsetDays: -4,
      start: '11:00',
      end: '12:30',
      location: 'Conference Room',
      status: 'completed',
    },
  ];

  const insertEvent = db.prepare(
    `INSERT INTO events (title, description, event_type, organizer_id, organizer_name,
                         event_date, start_time, end_time, all_day, location, status,
                         important, is_public, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertResponsibility = db.prepare(
    `INSERT INTO responsibilities (event_id, title, assigned_user_id, assigned_team, note, due_at,
                                   status, public_visibility, position, completed_by, completed_at,
                                   created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertNote = db.prepare(
    `INSERT INTO event_notes (event_id, created_by, content) VALUES (?, ?, ?)`
  );
  const insertActivity = db.prepare(
    `INSERT INTO activity_log (event_id, user_id, action, metadata) VALUES (?, ?, ?, ?)`
  );

  for (const event of demo) {
    const date = addDays(today, event.offsetDays);
    const allDay = event.allDay === true;
    const organizerId = orgIds.get(event.organizer) ?? null;

    const result = insertEvent.run(
      event.title,
      event.description ?? '',
      event.type,
      organizerId,
      event.organizer,
      date,
      allDay ? null : event.start ?? null,
      allDay ? null : event.end ?? null,
      allDay ? 1 : 0,
      event.location,
      event.status ?? 'planning',
      event.important ? 1 : 0,
      event.isPublic === false ? 0 : 1,
      authorId
    );
    const eventId = Number(result.lastInsertRowid);

    insertActivity.run(eventId, authorId, 'event.created', JSON.stringify({ title: event.title }));

    (event.responsibilities ?? []).forEach((responsibility, index) => {
      const status = responsibility.status ?? 'not_started';
      const completed = status === 'completed';
      insertResponsibility.run(
        eventId,
        responsibility.title,
        responsibility.assignTo ? assigneeIds[responsibility.assignTo] : null,
        responsibility.team,
        responsibility.note ?? '',
        responsibility.dueOffsetDays !== undefined
          ? `${addDays(today, responsibility.dueOffsetDays)} ${responsibility.dueTime ?? '18:00'}`
          : null,
        status,
        responsibility.isPublic ? 1 : 0,
        index,
        completed ? authorId : null,
        completed ? new Date().toISOString().replace('T', ' ').slice(0, 19) : null,
        authorId
      );
      if (completed) {
        insertActivity.run(
          eventId,
          authorId,
          'responsibility.completed',
          JSON.stringify({ title: responsibility.title, assigned_to: responsibility.team })
        );
      }
    });

    for (const note of event.notes ?? []) {
      insertNote.run(eventId, authorId, note);
    }
  }

  // A couple of private Quick Notes so the feature is not an empty shell for
  // whoever signs in first. They belong to the super admin alone.
  if (authorId) {
    const insertQuickNote = db.prepare(
      `INSERT INTO quick_notes (user_id, title, content, pinned) VALUES (?, ?, ?, ?)`
    );
    insertQuickNote.run(
      authorId,
      'Media photos',
      'Need photos and a short reel from the technical workshop.',
      1
    );
    insertQuickNote.run(authorId, 'Sir meeting', 'Ask about the seminar hall booking for next month.', 1);
    insertQuickNote.run(
      authorId,
      'Certificate design',
      'Need the final certificate design before Friday.',
      0
    );
  }
  if (staffAdmin) {
    getDb()
      .prepare(`INSERT INTO quick_notes (user_id, title, content, pinned) VALUES (?, ?, ?, 0)`)
      .run(staffAdmin.id, 'Venue list', 'Confirm whether the library hall is free on weekends.');
  }
}

if (require.main === module) {
  getDb();
  ensureSeedData();
  console.log('[mrtc-calendar] seed complete.');
}
