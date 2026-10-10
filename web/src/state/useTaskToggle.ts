import { useCallback, useState } from 'react';
import { ApiError, api } from '../api/client';
import { invalidate, patchCache, peekAll } from '../api/useQuery';
import type {
  EventDetail,
  EventListResponse,
  OverviewResponse,
  Readiness,
  Responsibility,
  ResponsibilityStatus,
  TaskWithEvent,
} from '../api/types';
import { useToast } from './ToastContext';

/** not started -> in progress -> done -> not started (spec 10). */
export function nextStatus(status: ResponsibilityStatus): ResponsibilityStatus {
  if (status === 'not_started') return 'in_progress';
  if (status === 'in_progress') return 'completed';
  return 'not_started';
}

/** Mirrors the server so an optimistic readiness figure matches what arrives. */
function buildReadiness(total: number, completed: number): Readiness | null {
  if (total <= 0) return null;
  const percent = Math.round((completed / total) * 100);
  return {
    total,
    completed,
    percent,
    label: percent >= 90 ? 'ready' : percent >= 50 ? 'in_progress' : 'needs_attention',
  };
}

function recount(responsibilities: Responsibility[]): Readiness | null {
  return buildReadiness(
    responsibilities.length,
    responsibilities.filter((item) => item.status === 'completed').length
  );
}

function shift(readiness: Readiness | null, delta: number): Readiness | null {
  if (!readiness) return readiness;
  const completed = Math.min(Math.max(readiness.completed + delta, 0), readiness.total);
  return buildReadiness(readiness.total, completed);
}

/**
 * Ticking a checklist item, applied to the screen first and sent afterwards.
 *
 * A checklist that waits on a round trip before the box fills in feels broken
 * on a slow connection, and these get clicked in runs of five or six. The
 * change is written into the cache so every view of it moves together - the
 * event page, its readiness bar, My tasks, the calendar chips. If the request
 * fails we say so and drop the caches we touched, so the next read is truthful.
 */
export function useTaskToggle() {
  const { notify } = useToast();
  const [pendingId, setPendingId] = useState<number | null>(null);

  const toggle = useCallback(
    async (
      responsibilityId: number,
      status: ResponsibilityStatus,
      options: { eventId?: number; title?: string; onSettled?: () => void } = {}
    ) => {
      const next = nextStatus(status);
      // Completing one or un-completing one is what moves a readiness figure;
      // not-started to in-progress does not.
      const delta = next === 'completed' ? 1 : status === 'completed' ? -1 : 0;
      setPendingId(responsibilityId);

      // Event detail holds the rows themselves, so its readiness is recomputed
      // rather than nudged. It also tells us which event this belongs to.
      let eventId = options.eventId;
      patchCache<EventDetail>('/events/', (detail) => {
        if (!Array.isArray(detail?.responsibilities)) return detail;
        if (!detail.responsibilities.some((item) => item.id === responsibilityId)) return detail;
        eventId = detail.event.id;
        const responsibilities = detail.responsibilities.map((item) =>
          item.id === responsibilityId ? { ...item, status: next } : item
        );
        return {
          ...detail,
          responsibilities,
          event: { ...detail.event, readiness: recount(responsibilities) },
        };
      });

      if (eventId === undefined) {
        // Fall back to the task lists, which name the event they belong to.
        for (const payload of peekAll<{ tasks: TaskWithEvent[] }>('/tasks')) {
          const found = payload?.tasks?.find((task) => task.id === responsibilityId);
          if (found) {
            eventId = found.event.id;
            break;
          }
        }
      }

      // List payloads carry only a readiness summary, so the one event that
      // changed is nudged by one and the rest are left alone.
      if (delta !== 0 && eventId !== undefined) {
        const target = eventId;
        patchCache<EventListResponse>('/events?', (list) => {
          if (!Array.isArray(list?.events)) return list;
          if (!list.events.some((event) => event.id === target)) return list;
          return {
            ...list,
            events: list.events.map((event) =>
              event.id === target ? { ...event, readiness: shift(event.readiness, delta) } : event
            ),
          };
        });
      }

      // The admin home shows the same tasks, a count of the open ones, and a
      // readiness row per event.
      patchCache<OverviewResponse>('/overview', (overview) => {
        const admin = overview?.admin;
        if (!admin || !Array.isArray(admin.my_tasks)) return overview;

        const mine = admin.my_tasks.some((task) => task.id === responsibilityId);
        const readiness =
          delta !== 0 && eventId !== undefined
            ? admin.readiness.map((entry) =>
                entry.event_id === eventId
                  ? { ...entry, readiness: shift(entry.readiness, delta) }
                  : entry
              )
            : admin.readiness;

        if (!mine && readiness === admin.readiness) return overview;

        return {
          ...overview,
          admin: {
            ...admin,
            readiness,
            stats: mine
              ? { ...admin.stats, my_open_tasks: Math.max(0, admin.stats.my_open_tasks - delta) }
              : admin.stats,
            my_tasks: mine
              ? admin.my_tasks.map((task) =>
                  task.id === responsibilityId ? { ...task, status: next } : task
                )
              : admin.my_tasks,
          },
        };
      });

      patchCache<{ tasks: TaskWithEvent[] }>('/tasks', (payload) => {
        if (!Array.isArray(payload?.tasks)) return payload;
        if (!payload.tasks.some((task) => task.id === responsibilityId)) return payload;
        return {
          ...payload,
          tasks: payload.tasks.map((task) =>
            task.id === responsibilityId ? { ...task, status: next } : task
          ),
        };
      });

      try {
        await api(`/responsibilities/${responsibilityId}`, {
          method: 'PATCH',
          body: { status: next },
        });
        // The optimistic figures are already right; the caller's reload brings
        // back anything derived that we did not model.
        options.onSettled?.();
        if (next === 'completed') {
          notify(options.title ? `"${options.title}" marked complete.` : 'Marked complete.');
        }
      } catch (cause) {
        // Our guess is now worse than no guess at all.
        invalidate('/events');
        invalidate('/tasks');
        invalidate('/overview');
        options.onSettled?.();
        notify(
          cause instanceof ApiError ? cause.message : 'We could not update that task.',
          'error'
        );
      } finally {
        setPendingId(null);
      }
    },
    [notify]
  );

  return { toggle, pendingId };
}
