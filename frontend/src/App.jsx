import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './layout/AppLayout.jsx';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import { useAuth } from './context/AuthContext.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Projects from './pages/Projects.jsx';
import ProjectDetail from './pages/ProjectDetail.jsx';
import RiskAnalysis from './pages/RiskAnalysis.jsx';
import Priorities from './pages/Priorities.jsx';
import Activity from './pages/Activity.jsx';
import Users from './pages/Users.jsx';
import AccessMatrix from './pages/AccessMatrix.jsx';
import Trash from './pages/Trash.jsx';
import History from './pages/History.jsx';

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/risk" element={<RiskAnalysis />} />
        <Route path="/priorities" element={<Priorities />} />
        <Route path="/activity" element={<Activity />} />
        <Route
          path="/users"
          element={
            <ProtectedRoute roles={['admin', 'superadmin']}>
              <Users />
            </ProtectedRoute>
          }
        />
        <Route
          path="/access"
          element={
            <ProtectedRoute roles={['admin', 'superadmin']}>
              <AccessMatrix />
            </ProtectedRoute>
          }
        />
        <Route
          path="/trash"
          element={
            <ProtectedRoute roles={['admin', 'superadmin']}>
              <Trash />
            </ProtectedRoute>
          }
        />
        <Route
          path="/history"
          element={
            <ProtectedRoute roles={['admin', 'superadmin', 'manager']}>
              <History />
            </ProtectedRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
