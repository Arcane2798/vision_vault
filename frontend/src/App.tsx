import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { LoadingState } from '@/components/ui/States';
import { config } from '@/config/env';

// each page is its own chunk -> faster first load
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const LiveMonitoringPage = lazy(() => import('@/pages/LiveMonitoringPage'));
const IncidentsPage = lazy(() => import('@/pages/IncidentsPage'));
const IncidentDetailPage = lazy(() => import('@/pages/IncidentDetailPage'));
const PeoplePage = lazy(() => import('@/pages/PeoplePage'));
const TestVideoPage = lazy(() => import('@/pages/TestVideoPage'));
const HouseMapPage = lazy(() => import('@/pages/HouseMapPage'));
const GuardPage = lazy(() => import('@/pages/GuardPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

export default function App() {
  return (
    <Suspense fallback={<LoadingState label={`Starting ${config.appName}…`} className="min-h-screen" />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        {/* the guard house's own screen: outside AppLayout (no sidebar, top bar or assistant) */}
        <Route path="/guard" element={<ProtectedRoute><GuardPage /></ProtectedRoute>} />
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<ProtectedRoute permission="view:dashboard"><DashboardPage /></ProtectedRoute>} />
          <Route path="live" element={<ProtectedRoute permission="view:live"><LiveMonitoringPage /></ProtectedRoute>} />
          <Route path="incidents" element={<ProtectedRoute permission="view:incidents"><IncidentsPage /></ProtectedRoute>} />
          <Route path="incidents/:id" element={<ProtectedRoute permission="view:incidents"><IncidentDetailPage /></ProtectedRoute>} />
          <Route path="people" element={<ProtectedRoute permission="manage:people"><PeoplePage /></ProtectedRoute>} />
          <Route path="test-video" element={<ProtectedRoute permission="view:live"><TestVideoPage /></ProtectedRoute>} />
          <Route path="map" element={<ProtectedRoute permission="view:live"><HouseMapPage /></ProtectedRoute>} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
