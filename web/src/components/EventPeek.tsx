import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import { EventSheet } from './EventSheet';

export type OpenEvent = (eventId: number) => void;

const EventPeekContext = createContext<OpenEvent | null>(null);

/**
 * Lets any event link open a slide-over instead of navigating away.
 *
 * Reading a calendar is a scanning task: you open four events in a row to
 * find the one you meant. Making each of those a full page load means four
 * trips back to the month you were looking at. The links stay real links -
 * cmd-click and "open in new tab" still work - a plain click just peeks.
 */
export function EventPeekProvider({ children }: { children: ReactNode }) {
  const [eventId, setEventId] = useState<number | null>(null);
  const { pathname } = useLocation();

  // Navigating away (from the sheet's own "Open full page", say) closes it.
  useEffect(() => {
    setEventId(null);
  }, [pathname]);

  const open = useCallback<OpenEvent>((id) => setEventId(id), []);
  const close = useCallback(() => setEventId(null), []);

  return (
    <EventPeekContext.Provider value={open}>
      {children}
      <EventSheet eventId={eventId} onClose={close} />
    </EventPeekContext.Provider>
  );
}

export function useEventPeek(): OpenEvent | null {
  return useContext(EventPeekContext);
}

/**
 * Spread onto an event `<Link>`. Modified clicks and middle clicks fall
 * through to the browser so the link keeps behaving like a link.
 */
export function usePeekProps(eventId: number) {
  return peekProps(useEventPeek(), eventId);
}

/**
 * The same thing for lists that render many links from one `.map()`, where a
 * hook per row is not an option: take `useEventPeek()` once, then call this.
 */
export function peekProps(open: OpenEvent | null, eventId: number) {
  if (!open) return {};
  return {
    onClick: (clickEvent: MouseEvent<HTMLAnchorElement>) => {
      if (
        clickEvent.metaKey ||
        clickEvent.ctrlKey ||
        clickEvent.shiftKey ||
        clickEvent.altKey ||
        clickEvent.button !== 0
      ) {
        return;
      }
      clickEvent.preventDefault();
      open(eventId);
    },
  };
}
