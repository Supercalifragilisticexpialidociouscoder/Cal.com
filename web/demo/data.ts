/**
 * Seed content for the browser demo, mirroring server/src/db/seed.ts.
 * Dates are offsets from today so the calendar is always current.
 */
import type { EventStatus, EventType, ResponsibilityStatus, SourceType } from '../src/api/types';

export interface SeedOrganization {
  name: string;
  type: SourceType;
  sort: number;
}

export const ORGANIZATIONS: SeedOrganization[] = [
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

export const VENUES = [
  'Seminar Hall',
  'Auditorium',
  'Conference Room',
  'Media Room',
  'Ground',
  'Classroom Block A',
  'Library Hall',
  'Online',
];

export interface SeedUser {
  id: number;
  name: string;
  email: string;
  password: string;
  role: 'super_admin' | 'staff_admin';
}

/**
 * Demo identities, deliberately not the real administrator accounts.
 *
 * The demo checks these in the browser, so they ship inside the published
 * bundle where anyone can read them. Real credentials must never appear here -
 * these exist only so the demo can show the administrator experience.
 */
export const USERS: SeedUser[] = [
  { id: 1, name: 'Demo Super Admin', email: 'admin@demo.cal8', password: 'demo-super-admin', role: 'super_admin' },
  { id: 2, name: 'Demo Staff One', email: 'staff1@demo.cal8', password: 'demo-staff-one', role: 'staff_admin' },
  { id: 3, name: 'Demo Staff Two', email: 'staff2@demo.cal8', password: 'demo-staff-two', role: 'staff_admin' },
];

export interface SeedResponsibility {
  title: string;
  team: string;
  assignTo?: 1 | 2 | 3;
  note?: string;
  status?: ResponsibilityStatus;
  isPublic?: boolean;
  dueOffsetDays?: number;
  dueTime?: string;
}

export interface SeedEvent {
  title: string;
  description?: string;
  type: EventType;
  organizer: string;
  offsetDays: number;
  start?: string;
  end?: string;
  allDay?: boolean;
  location: string;
  status?: EventStatus;
  important?: boolean;
  isPublic?: boolean;
  responsibilities?: SeedResponsibility[];
  notes?: string[];
}

export const EVENTS: SeedEvent[] = [
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
      { title: 'Venue Setup', team: 'Maintenance Team', note: 'Complete by 8:00 AM.', status: 'completed', isPublic: true },
      { title: 'Photography', team: 'Media Club', note: 'Photos plus a 30 second reel for the workshop.', status: 'completed', isPublic: true },
      { title: 'Speaker confirmation', team: 'Technical Club', status: 'completed' },
      { title: 'Refreshments', team: 'Student Council', status: 'completed' },
      { title: 'Registration desk', team: 'Technical Club', status: 'completed', isPublic: true },
      { title: 'Problem set review', team: 'Computer Science Department', status: 'completed' },
      { title: 'Projector and audio test', team: 'Maintenance Team', status: 'completed' },
      { title: 'Certificates', team: 'Cultural Club', note: 'Print 150 certificates.', status: 'in_progress' },
      { title: 'Feedback form', team: 'Technical Club', note: 'Share the QR code at the end.' },
      { title: 'Decoration', team: 'Cultural Club', note: 'Stage and entrance decoration.' },
      { title: 'Confirm photographer arrival', team: '', assignTo: 2, note: 'Call by 8 AM.', dueOffsetDays: 3, dueTime: '08:00' },
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
      { title: 'Approve the final poster', team: '', assignTo: 1, note: 'Sir wants to see it before it goes out.', dueOffsetDays: 2, dueTime: '17:00' },
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
    description: 'Welcome programme for the incoming batch: introductions, performances and the club fair.',
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
      { title: 'Registration desk', team: "Women's Club", isPublic: true },
      { title: 'Certificates and mementos', team: 'Cultural Club' },
      { title: 'Seating plan', team: 'Student Council', note: 'Reserve the first two rows for faculty.' },
      { title: 'Cleanup crew', team: 'Maintenance Team' },
      { title: 'Confirm venue booking', team: '', assignTo: 2, note: 'Written confirmation from the office.', dueOffsetDays: 6, dueTime: '16:00' },
      { title: 'Finalise certificates', team: '', assignTo: 3, note: 'Cultural Club will supply the design.', dueOffsetDays: 9, dueTime: '18:00' },
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
      { title: 'Get the event photos', team: '', assignTo: 2, note: 'Collect from Media Club the next morning.' },
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
      { title: 'Share the speaker brief', team: '', assignTo: 1, note: 'Two slides on what MRTC does.', dueOffsetDays: 8, dueTime: '12:00' },
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

export const QUICK_NOTES: Array<{ userId: number; title: string; content: string; pinned: boolean }> = [
  { userId: 1, title: 'Media photos', content: 'Need photos and a short reel from the technical workshop.', pinned: true },
  { userId: 1, title: 'Sir meeting', content: 'Ask about the seminar hall booking for next month.', pinned: true },
  { userId: 1, title: 'Certificate design', content: 'Need the final certificate design before Friday.', pinned: false },
  { userId: 2, title: 'Venue list', content: 'Confirm whether the library hall is free on weekends.', pinned: false },
];
