import { Link, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { t } from "./i18n/he";
import { RequireAuth } from "./RequireAuth";
import { ProjectNav } from "./ProjectNav";
import { LoginPage } from "./pages/LoginPage";
import { ProjectSwitcherPage } from "./pages/ProjectSwitcherPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DocumentsPage } from "./pages/DocumentsPage";
import { FindingsPage } from "./pages/FindingsPage";
import { TeamPage } from "./pages/TeamPage";
import { TendersPage } from "./pages/TendersPage";
import { TenderDetailPage } from "./pages/TenderDetailPage";
import { BidComparisonPage } from "./pages/BidComparisonPage";
import { ContractPage } from "./pages/ContractPage";
import { ContractorProfilePage } from "./pages/ContractorProfilePage";
import { ChatPage } from "./pages/ChatPage";
import { CadViewerPage } from "./pages/CadViewerPage";
import { ChecklistTemplatesPage } from "./pages/ChecklistTemplatesPage";
import { ChecklistTemplateDetailPage } from "./pages/ChecklistTemplateDetailPage";
import { InspectionsPage } from "./pages/InspectionsPage";
import { InspectionPage } from "./pages/InspectionPage";
import { HoldPointsPage } from "./pages/HoldPointsPage";
import { DefectsPage } from "./pages/DefectsPage";
import { LabTestsPage } from "./pages/LabTestsPage";
import { DailyLogsPage } from "./pages/DailyLogsPage";
import { QuoteComparisonPage } from "./pages/QuoteComparisonPage";
import { QuoteComparisonsPage } from "./pages/QuoteComparisonsPage";
import { Form4Page } from "./pages/Form4Page";
import { NotificationBell } from "./NotificationBell";
import { SyncStatus } from "./offline/SyncStatus";

function TopBar() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <div className="topbar">
      <div className="logo">
        Build<span>Guard</span>
      </div>
      <Link to="/checklists">{t("nav.checklists")}</Link>
      <div className="spacer" />
      <NotificationBell />
      <div className="who">{user.displayName}</div>
      <button onClick={logout}>{t("app.signOut")}</button>
    </div>
  );
}

function ProjectLayout() {
  return (
    <>
      <ProjectNav />
      <Outlet />
    </>
  );
}

export function App() {
  return (
    <>
      <TopBar />
      <SyncStatus />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/checklists"
          element={
            <RequireAuth>
              <ChecklistTemplatesPage />
            </RequireAuth>
          }
        />
        <Route
          path="/checklists/:templateId"
          element={
            <RequireAuth>
              <ChecklistTemplateDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/"
          element={
            <RequireAuth>
              <ProjectSwitcherPage />
            </RequireAuth>
          }
        />
        <Route
          path="/projects/:projectId"
          element={
            <RequireAuth>
              <ProjectLayout />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="findings" element={<FindingsPage />} />
          <Route path="inspections" element={<InspectionsPage />} />
          <Route path="inspections/:inspectionId" element={<InspectionPage />} />
          <Route path="defects" element={<DefectsPage />} />
          <Route path="lab-tests" element={<LabTestsPage />} />
          <Route path="daily-logs" element={<DailyLogsPage />} />
          <Route path="form4" element={<Form4Page />} />
          <Route path="hold-points" element={<HoldPointsPage />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="tenders" element={<TendersPage />} />
          <Route path="tenders/:tenderId" element={<TenderDetailPage />} />
          <Route path="tenders/:tenderId/bids" element={<BidComparisonPage />} />
          <Route path="contracts/:contractId" element={<ContractPage />} />
          <Route path="contractor-profile" element={<ContractorProfilePage />} />
          <Route path="quotes" element={<QuoteComparisonsPage />} />
          <Route path="quotes/:comparisonId" element={<QuoteComparisonPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="documents/:documentId/cad" element={<CadViewerPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
