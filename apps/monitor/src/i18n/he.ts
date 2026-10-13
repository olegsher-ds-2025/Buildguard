import { he_checklistEditor } from "./he.checklistEditor";
import { he_checklists } from "./he.checklists";
import { he_docs } from "./he.docs";
import { he_holdPoints } from "./he.holdPoints";
import { he_inspections } from "./he.inspections";
import { he_offline } from "./he.offline";
import { he_labTests } from "./he.labTests";
import { he_photos } from "./he.photos";
import { he_quotes } from "./he.quotes";
import { he_reports } from "./he.reports";
import { he_tenders } from "./he.tenders";
import { he_team } from "./he.team";

export const he = {
  "app.signOut": "התנתקות",
  "nav.dashboard": "בית",
  "nav.documents": "מסמכים",
  "nav.findings": "ליקויים",
  "nav.team": "צוות",
  "nav.tenders": "מכרזים",
  "nav.chat": "שאל",
  "nav.contractorProfile": "פרופיל קבלן",
  "login.subtitle": "התחברו כדי לעקוב אחרי הפרויקט",
  "login.email": "אימייל",
  "login.password": "סיסמה",
  "login.submit": "התחברות",
  "login.submitting": "מתחבר…",
  "login.invalid": "אימייל או סיסמה שגויים.",
  "login.unreachable": "לא ניתן להתחבר לשרת.",
  "dashboard.loading": "טוען פרויקט…",
  "dashboard.error": "לא ניתן לטעון את הפרויקט.",
  "dashboard.progress": "התקדמות",
  "dashboard.budgetUsed": "ניצול תקציב",
  "dashboard.budgetOf": "מתוך",
  "dashboard.nextMilestone": "אבן דרך הבאה",
  "dashboard.days": "ימים",
  "dashboard.noMilestone": "אין אבני דרך מתוכננות",
  "dashboard.openFindings": "ליקויים פתוחים",
  "dashboard.allReviewed": "הכול נבדק",
  "dashboard.awaitingReview": "ממתינים לבדיקה",
  "dashboard.phases": "שלבי הפרויקט",
  "dashboard.phasesHint": "ההתקדמות משלבת השלמת משימות ואבני דרך מאומתות.",
  "dashboard.budget": "תקציב",
  "dashboard.budgetHint": "מתוכנן מול ביצוע לפי סעיף.",
  "dashboard.noProgress": "הוצאות ללא התקדמות מדודה",
  "dashboard.burnRate": "קצב שריפה",
  "dashboard.spentAt": "הוצאו בהתקדמות של",
  "dashboard.line": "סעיף",
  "dashboard.planned": "מתוכנן",
  "dashboard.actual": "בפועל",
  "dashboard.used": "ניצול",
  "dashboard.total": "סה״כ",
  ...he_checklists,
  ...he_checklistEditor,
  ...he_offline,
  ...he_docs,
  ...he_holdPoints,
  ...he_inspections,
  ...he_labTests,
  ...he_photos,
  ...he_reports,
  ...he_tenders,
  ...he_team,
  ...he_quotes,
} as const;

export type MessageKey = keyof typeof he;

export function t(key: MessageKey): string {
  return he[key];
}

const projectRoleLabels: Record<string, string> = {
  owner: "בעל הנכס",
  project_manager: "מנהל פרויקט",
  contractor: "קבלן",
  inspector: "מפקח בנייה",
  viewer: "צפייה בלבד",
};

const phaseStatusLabels: Record<string, string> = {
  not_started: "טרם התחיל",
  in_progress: "בביצוע",
  verified: "אומת",
};

const tenderStatusLabels: Record<string, string> = {
  draft: "טיוטה",
  published: "פורסם",
  invited_bidding: "הצעות מחיר פתוחות",
  awarded: "נבחר זוכה",
  closed: "סגור",
  cancelled: "בוטל",
};

const invitationStatusLabels: Record<string, string> = {
  invited: "הוזמן",
  declined: "דחה",
  bid_submitted: "הגיש הצעה",
};

const label = (map: Record<string, string>, value: string) => map[value] ?? value.replace(/_/g, " ");

export const roleLabel = (v: string) => label(projectRoleLabels, v);
export const phaseStatusLabel = (v: string) => label(phaseStatusLabels, v);
export const tenderStatusLabel = (v: string) => label(tenderStatusLabels, v);
export const invitationStatusLabel = (v: string) => label(invitationStatusLabels, v);
