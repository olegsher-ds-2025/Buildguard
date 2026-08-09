import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { RequireAuth } from "./RequireAuth";
import { LoginPage } from "./pages/LoginPage";
import { ContractorsPage } from "./pages/ContractorsPage";
import { ClientsPage } from "./pages/ClientsPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { UsersPage } from "./pages/UsersPage";
import { AuditLogPage } from "./pages/AuditLogPage";

function TopBar() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <div className="topbar">
      <div className="logo">
        Build<span>Guard</span> <span className="badge">Admin</span>
      </div>
      <nav className="nav-tabs">
        <NavLink to="/contractors" className={({ isActive }) => (isActive ? "active" : "")}>
          Contractors
        </NavLink>
        <NavLink to="/clients" className={({ isActive }) => (isActive ? "active" : "")}>
          Clients
        </NavLink>
        <NavLink to="/projects" className={({ isActive }) => (isActive ? "active" : "")}>
          Projects
        </NavLink>
        <NavLink to="/users" className={({ isActive }) => (isActive ? "active" : "")}>
          Users
        </NavLink>
        <NavLink to="/audit-log" className={({ isActive }) => (isActive ? "active" : "")}>
          Audit log
        </NavLink>
      </nav>
      <div className="spacer" />
      <div className="who">
        {user.displayName} · {user.staffRole}
      </div>
      <button onClick={logout}>Sign out</button>
    </div>
  );
}

export function App() {
  return (
    <>
      <TopBar />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/contractors"
          element={
            <RequireAuth>
              <ContractorsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/clients"
          element={
            <RequireAuth>
              <ClientsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/projects"
          element={
            <RequireAuth>
              <ProjectsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/users"
          element={
            <RequireAuth>
              <UsersPage />
            </RequireAuth>
          }
        />
        <Route
          path="/audit-log"
          element={
            <RequireAuth>
              <AuditLogPage />
            </RequireAuth>
          }
        />
        <Route path="/" element={<Navigate to="/contractors" replace />} />
        <Route path="*" element={<Navigate to="/contractors" replace />} />
      </Routes>
    </>
  );
}
