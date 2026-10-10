/**
 * Whether a keystroke should be left alone by a global shortcut.
 *
 * Two cases: the person is typing, or something modal is open over the page.
 * A bare letter like "w" must not switch the calendar view behind a slide-over
 * just because focus happens to be on the body.
 */
export function shouldIgnoreShortcut(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;

  if (target) {
    if (target.isContentEditable) return true;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return true;
    if (target.closest('[role="dialog"]')) return true;
  }

  return typeof document !== 'undefined' && document.querySelector('[role="dialog"]') !== null;
}
