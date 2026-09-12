import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-2xs font-semibold uppercase tracking-widest text-accent">Page not found</p>
      <h1 className="mt-2 text-xl font-semibold text-ink">
        We could not find that page.
      </h1>
      <p className="mt-2 text-sm text-muted">
        The link may be out of date, or the page may have moved.
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <Link to="/" className="btn btn-md btn-primary">
          Go to the calendar
        </Link>
        <Link to="/events" className="btn btn-md btn-outline">
          Browse events
        </Link>
      </div>
    </div>
  );
}
