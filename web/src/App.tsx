import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Spinner } from './components/ui';
import { CalendarPage } from './pages/CalendarPage';
import { EventDetailPage } from './pages/EventDetailPage';
import { EventsPage } from './pages/EventsPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { OverviewPage } from './pages/OverviewPage';
import { UpcomingPage } from './pages/UpcomingPage';
import { useAuth } from './state/AuthContext';

// Administration is split into its own chunks, so a student browsing the
// public calendar never downloads the admin interface (spec 36).
const AdminOverviewPage = lazy(() =>
  import('./pages/admin/AdminOverviewPage').then((module) => ({ default: module.AdminOverviewPage }))
);
const TasksPage = lazy(() =>
  import('./pages/admin/TasksPage').then((module) => ({ default: module.TasksPage }))
);
const NotesPage = lazy(() =>
  import('./pages/admin/NotesPage').then((module) => ({ default: module.NotesPage }))
);
const EventFormPage = lazy(() =>
  import('./pages/admin/EventFormPage').then((module) => ({ default: module.EventFormPage }))
);
const ManagePage = lazy(() =>
  import('./pages/admin/ManagePage').then((module) => ({ default: module.ManagePage }))
);
const AccountPage = lazy(() =>
  import('./pages/admin/AccountPage').then((module) => ({ default: module.AccountPage }))
);

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/events/:id" element={<EventDetailPage />} />
        <Route path="/upcoming" element={<UpcomingPage />} />
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <AdminOverviewPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/tasks"
          element={
            <RequireAdmin>
              <TasksPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/notes"
          element={
            <RequireAdmin>
              <NotesPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/events/new"
          element={
            <RequireAdmin>
              <EventFormPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/events/:id/edit"
          element={
            <RequireAdmin>
              <EventFormPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/manage"
          element={
            <RequireAdmin>
              <ManagePage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/account"
          element={
            <RequireAdmin>
              <AccountPage />
            </RequireAdmin>
          }
        />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  );
}

/**
 * Client-side gate for the admin routes. It is a convenience, not the
 * security boundary: every admin endpoint checks the session server side.
 */
function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner label="Checking your session" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
