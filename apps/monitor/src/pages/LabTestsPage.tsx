import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { ApiError } from "@buildguard/api-client";
import type {
  ConcretePourSummary,
  ConcreteResultSummary,
  FormworkStatus,
  TimedTestKind,
  TimedTestOutcome,
  TimedTestSummary,
} from "@buildguard/shared-types";
import { api } from "../api";
import { formatDate, formatDateTime } from "../format";
import { t, type MessageKey } from "../i18n/he";
import { useMyProjectRole } from "../useMyProjectRole";

const REFETCH_MS = 60_000;
const TICK_MS = 30_000;
const GRADE_B30 = "ב-30";
const GRADE_B30_MPA = 33;
const AGES = [7, 28] as const;
const DEFAULT_HOURS: Record<TimedTestKind, number> = { pressure: 24, flood: 72 };

function parseNumber(value: string): number | undefined {
  const trimmed = value.trim().replace(",", ".");
  if (trimmed === "") return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

function toLocalInput(date: Date): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  return now;
}

function formatRemaining(ms: number): string {
  const minutes = Math.max(0, Math.ceil(ms / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const parts = [];
  if (days > 0) parts.push(`${days} ${t("labTests.timed.days")}`);
  if (days > 0 || hours > 0) parts.push(`${hours} ${t("labTests.timed.hours")}`);
  if (days === 0) parts.push(`${minutes % 60} ${t("labTests.timed.minutes")}`);
  return parts.join(" ");
}

function formworkConflictText(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    const body = error.body as { formworkStatus?: FormworkStatus; earliestFormworkRemovalAt?: string | null } | undefined;
    const reason = body?.formworkStatus ? t(`labTests.formwork.${body.formworkStatus}` as MessageKey) : t("labTests.formwork.conflict");
    const earliest = body?.earliestFormworkRemovalAt
      ? ` ${t("labTests.formwork.conflictEarliest")} ${formatDate(body.earliestFormworkRemovalAt)}`
      : "";
    return `${t("labTests.formwork.conflict")}: ${reason}.${earliest}`;
  }
  return t("labTests.actionFailed");
}

function ResultForm({ projectId, pour, onClose }: { projectId: string; pour: ConcretePourSummary; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [ageDays, setAgeDays] = useState<7 | 28>(7);
  const [strength, setStrength] = useState("");
  const [note, setNote] = useState("");
  const strengthMpa = parseNumber(strength);
  const isRetest = pour.results.some((r) => r.ageDays === ageDays);

  const record = useMutation({
    mutationFn: () =>
      api.recordConcreteResult(projectId, pour.id, {
        ageDays,
        strengthMpa: strengthMpa!,
        ...(note.trim() && { note: note.trim() }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["concrete-pours", projectId] });
      onClose();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    record.mutate();
  }

  return (
    <form className="lab-form" onSubmit={submit}>
      <label className="editor-field">
        {t("labTests.result.age")}
        <select value={ageDays} onChange={(e) => setAgeDays(Number(e.target.value) as 7 | 28)}>
          {AGES.map((age) => (
            <option key={age} value={age}>
              {t(`labTests.result.age${age}` as MessageKey)}
            </option>
          ))}
        </select>
      </label>
      <label className="editor-field">
        {t("labTests.result.strength")}
        <input type="text" inputMode="decimal" dir="ltr" value={strength} onChange={(e) => setStrength(e.target.value)} />
      </label>
      <label className="editor-field">
        {t("labTests.note")}
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {isRetest && <p className="hint">{t("labTests.result.retest")}</p>}
      {record.isError && <p className="form-error">{t("labTests.actionFailed")}</p>}
      <div className="editor-actions">
        <button type="submit" className="primary" disabled={strengthMpa === undefined || strengthMpa <= 0 || record.isPending}>
          {t("labTests.save")}
        </button>
        <button type="button" onClick={onClose} disabled={record.isPending}>
          {t("labTests.cancel")}
        </button>
      </div>
    </form>
  );
}

function ResultRow({ pour, ageDays, now }: { pour: ConcretePourSummary; ageDays: 7 | 28; now: number }) {
  const result: ConcreteResultSummary | undefined = pour.results.find((r) => r.ageDays === ageDays);
  const dueAt = ageDays === 7 ? pour.result7DueAt : pour.result28DueAt;
  const overdue = !result && new Date(dueAt).getTime() < now;
  const label = t(`labTests.result.age${ageDays}` as MessageKey);

  if (result) {
    return (
      <div className="lab-row">
        <span>{label}</span>
        <span className="lab-value">
          {result.strengthMpa} {t("labTests.pour.mpa")}
        </span>
        <span className={`lab-chip ${result.verdict}`}>{t(`labTests.result.${result.verdict}` as MessageKey)}</span>
      </div>
    );
  }
  return (
    <div className="lab-row">
      <span>{label}</span>
      <span className={`lab-due${overdue ? " overdue" : ""}`}>
        {t(overdue ? "labTests.result.overdue" : "labTests.result.due")}
        {formatDate(dueAt)}
      </span>
    </div>
  );
}

function FormworkControls({ projectId, pour }: { projectId: string; pour: ConcretePourSummary }) {
  const queryClient = useQueryClient();
  const [armed, setArmed] = useState(false);
  const ready = pour.formworkStatus === "ready";

  const remove = useMutation({
    mutationFn: () => api.removeFormwork(projectId, pour.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["concrete-pours", projectId] }),
    onSettled: () => setArmed(false),
  });

  if (pour.formworkStatus === "removed") return null;

  return (
    <>
      <div className="editor-actions">
        {armed ? (
          <>
            <button type="button" className="danger-btn armed" disabled={remove.isPending} onClick={() => remove.mutate()}>
              {t("labTests.formwork.confirm")}
            </button>
            <button type="button" disabled={remove.isPending} onClick={() => setArmed(false)}>
              {t("labTests.cancel")}
            </button>
          </>
        ) : (
          <button type="button" disabled={!ready} onClick={() => setArmed(true)}>
            {t("labTests.formwork.remove")}
          </button>
        )}
      </div>
      {!ready && <p className="hint">{t("labTests.formwork.notReadyHint")}</p>}
      {remove.isError && <p className="form-error">{formworkConflictText(remove.error)}</p>}
    </>
  );
}

function PourCard({ projectId, pour, isReviewer, now }: { projectId: string; pour: ConcretePourSummary; isReviewer: boolean; now: number }) {
  const [recording, setRecording] = useState(false);
  const planned = new Date(pour.castAt).getTime() > now;

  return (
    <div className="card lab-card">
      <div className="lab-head">
        <div>
          <div className="lab-title">{pour.element}</div>
          <div className="item-meta">
            <span>
              {pour.concreteGrade} · {t("labTests.pour.required")} {pour.requiredMpa28} {t("labTests.pour.mpa")}
            </span>
            <span>
              {t(planned ? "labTests.pour.planned" : "labTests.pour.cast")} {formatDateTime(pour.castAt)}
            </span>
            {pour.spanMeters !== null && (
              <span>
                {t("labTests.pour.spanValue")} {pour.spanMeters} {t("labTests.pour.meters")}
              </span>
            )}
            {pour.cantileverMeters !== null && (
              <span>
                {t("labTests.pour.cantileverValue")} {pour.cantileverMeters} {t("labTests.pour.meters")}
              </span>
            )}
          </div>
        </div>
        {planned && <span className="lab-chip planned">{t("labTests.pour.planned")}</span>}
      </div>
      <div className="lab-results">
        {AGES.map((age) => (
          <ResultRow key={age} pour={pour} ageDays={age} now={now} />
        ))}
      </div>
      <div className="lab-formwork">
        <span className={`lab-chip formwork-${pour.formworkStatus}`}>{t(`labTests.formwork.${pour.formworkStatus}` as MessageKey)}</span>
        {pour.formworkStatus === "removed" && pour.formworkRemovedAt && (
          <span className="item-meta">
            {t("labTests.formwork.removedAt")}
            {formatDate(pour.formworkRemovedAt)}
          </span>
        )}
        {pour.formworkStatus !== "removed" && pour.earliestFormworkRemovalAt && (
          <span className="item-meta">
            {t("labTests.formwork.earliest")}: {formatDate(pour.earliestFormworkRemovalAt)}
          </span>
        )}
      </div>
      {isReviewer && (
        <>
          {!recording && (
            <div className="editor-actions">
              <button type="button" className="primary" onClick={() => setRecording(true)}>
                {t("labTests.result.record")}
              </button>
            </div>
          )}
          {recording && <ResultForm projectId={projectId} pour={pour} onClose={() => setRecording(false)} />}
          <FormworkControls projectId={projectId} pour={pour} />
        </>
      )}
    </div>
  );
}

function NewPourForm({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [element, setElement] = useState("");
  const [grade, setGrade] = useState("");
  const [required, setRequired] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [slump, setSlump] = useState("");
  const [span, setSpan] = useState("");
  const [cantilever, setCantilever] = useState("");
  const [castAt, setCastAt] = useState(() => toLocalInput(new Date()));
  const [phaseId, setPhaseId] = useState("");

  const dashboard = useQuery({
    queryKey: ["dashboard", projectId],
    queryFn: () => api.getProjectDashboard(projectId),
  });

  const requiredMpa28 = parseNumber(required);
  const isB30 = grade.trim() === GRADE_B30;
  const requiredOk = requiredMpa28 !== undefined || isB30;
  const valid = element.trim() !== "" && grade.trim() !== "" && requiredOk && castAt !== "";

  const create = useMutation({
    mutationFn: () =>
      api.createConcretePour(projectId, {
        element: element.trim(),
        concreteGrade: grade.trim(),
        castAt: new Date(castAt).toISOString(),
        ...(requiredMpa28 !== undefined && { requiredMpa28 }),
        ...(deliveryNote.trim() && { deliveryNote: deliveryNote.trim() }),
        ...(parseNumber(slump) !== undefined && { slumpCm: parseNumber(slump) }),
        ...(parseNumber(span) !== undefined && { spanMeters: parseNumber(span) }),
        ...(parseNumber(cantilever) !== undefined && { cantileverMeters: parseNumber(cantilever) }),
        ...(phaseId && { phaseId }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["concrete-pours", projectId] });
      onClose();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  return (
    <form className="card lab-form" onSubmit={submit}>
      <label className="editor-field">
        {t("labTests.pour.element")}
        <input type="text" value={element} onChange={(e) => setElement(e.target.value)} />
      </label>
      <label className="editor-field">
        {t("labTests.pour.grade")}
        <input type="text" value={grade} onChange={(e) => setGrade(e.target.value)} />
      </label>
      <label className="editor-field">
        {t("labTests.pour.requiredMpa28")}
        <input
          type="text"
          inputMode="decimal"
          dir="ltr"
          placeholder={isB30 ? String(GRADE_B30_MPA) : undefined}
          value={required}
          onChange={(e) => setRequired(e.target.value)}
        />
      </label>
      <p className="hint">{t("labTests.pour.requiredHint")}</p>
      <label className="editor-field">
        {t("labTests.pour.deliveryNote")}
        <input type="text" value={deliveryNote} onChange={(e) => setDeliveryNote(e.target.value)} />
      </label>
      <label className="editor-field">
        {t("labTests.pour.slump")}
        <input type="text" inputMode="decimal" dir="ltr" value={slump} onChange={(e) => setSlump(e.target.value)} />
      </label>
      <label className="editor-field">
        {t("labTests.pour.span")}
        <input type="text" inputMode="decimal" dir="ltr" value={span} onChange={(e) => setSpan(e.target.value)} />
      </label>
      <label className="editor-field">
        {t("labTests.pour.cantilever")}
        <input type="text" inputMode="decimal" dir="ltr" value={cantilever} onChange={(e) => setCantilever(e.target.value)} />
      </label>
      <label className="editor-field">
        {t("labTests.pour.castAt")}
        <input type="datetime-local" value={castAt} onChange={(e) => setCastAt(e.target.value)} />
      </label>
      <label className="editor-field">
        {t("labTests.pour.phase")}
        <select value={phaseId} onChange={(e) => setPhaseId(e.target.value)}>
          <option value="">{t("labTests.pour.noPhase")}</option>
          {dashboard.data?.phases.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {create.isError && <p className="form-error">{t("labTests.actionFailed")}</p>}
      <div className="editor-actions">
        <button type="submit" className="primary" disabled={!valid || create.isPending}>
          {t("labTests.save")}
        </button>
        <button type="button" onClick={onClose} disabled={create.isPending}>
          {t("labTests.cancel")}
        </button>
      </div>
    </form>
  );
}

function ConcreteSection({ projectId, isReviewer }: { projectId: string; isReviewer: boolean }) {
  const [creating, setCreating] = useState(false);
  const now = useNow();
  const pours = useQuery({
    queryKey: ["concrete-pours", projectId],
    queryFn: () => api.listConcretePours(projectId),
  });

  if (pours.isLoading) return <div className="page-loading">{t("labTests.loading")}</div>;
  if (pours.isError || !pours.data) return <div className="page-error">{t("labTests.error")}</div>;

  const sorted = [...pours.data].sort((a, b) => b.castAt.localeCompare(a.castAt));

  return (
    <section className="section">
      {isReviewer && !creating && (
        <div className="editor-actions">
          <button type="button" className="primary" onClick={() => setCreating(true)}>
            {t("labTests.pour.new")}
          </button>
        </div>
      )}
      {creating && <NewPourForm projectId={projectId} onClose={() => setCreating(false)} />}
      {sorted.length === 0 && <p className="sub">{t("labTests.pour.empty")}</p>}
      <div className="grid">
        {sorted.map((pour) => (
          <PourCard key={pour.id} projectId={projectId} pour={pour} isReviewer={isReviewer} now={now} />
        ))}
      </div>
    </section>
  );
}

function StartTestForm({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<TimedTestKind>("pressure");
  const [location, setLocation] = useState("");
  const [startReading, setStartReading] = useState("");
  const [hours, setHours] = useState(String(DEFAULT_HOURS.pressure));

  const reading = parseNumber(startReading);
  const durationHours = parseNumber(hours);
  const durationOk =
    durationHours !== undefined && (kind === "pressure" ? durationHours >= 24 : durationHours >= 24 && durationHours <= 72);
  const valid = location.trim() !== "" && durationOk && (kind === "flood" || reading !== undefined);

  const start = useMutation({
    mutationFn: () =>
      api.startTimedTest(projectId, {
        kind,
        location: location.trim(),
        durationHours,
        ...(reading !== undefined && { startReading: reading }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["timed-tests", projectId] });
      onClose();
    },
  });

  function changeKind(next: TimedTestKind) {
    setKind(next);
    setHours(String(DEFAULT_HOURS[next]));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    start.mutate();
  }

  return (
    <form className="card lab-form" onSubmit={submit}>
      <label className="editor-field">
        {t("labTests.timed.kind")}
        <select value={kind} onChange={(e) => changeKind(e.target.value as TimedTestKind)}>
          <option value="pressure">{t("labTests.timed.kind.pressure")}</option>
          <option value="flood">{t("labTests.timed.kind.flood")}</option>
        </select>
      </label>
      <label className="editor-field">
        {t("labTests.timed.location")}
        <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} />
      </label>
      <label className="editor-field">
        {t(`labTests.timed.startReading.${kind}` as MessageKey)}
        <input type="text" inputMode="decimal" dir="ltr" value={startReading} onChange={(e) => setStartReading(e.target.value)} />
      </label>
      <label className="editor-field">
        {t("labTests.timed.duration")}
        <input type="text" inputMode="numeric" dir="ltr" value={hours} onChange={(e) => setHours(e.target.value)} />
      </label>
      <p className="hint">{t(`labTests.timed.durationHint.${kind}` as MessageKey)}</p>
      {start.isError && <p className="form-error">{t("labTests.actionFailed")}</p>}
      <div className="editor-actions">
        <button type="submit" className="primary" disabled={!valid || start.isPending}>
          {t("labTests.timed.start")}
        </button>
        <button type="button" onClick={onClose} disabled={start.isPending}>
          {t("labTests.cancel")}
        </button>
      </div>
    </form>
  );
}

function CompleteTestForm({ projectId, test, onClose }: { projectId: string; test: TimedTestSummary; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [endReading, setEndReading] = useState("");
  const [outcome, setOutcome] = useState<TimedTestOutcome>("passed");
  const [note, setNote] = useState("");
  const reading = parseNumber(endReading);

  const complete = useMutation({
    mutationFn: () =>
      api.completeTimedTest(projectId, test.id, {
        outcome,
        ...(reading !== undefined && { endReading: reading }),
        ...(note.trim() && { note: note.trim() }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["timed-tests", projectId] });
      onClose();
    },
  });

  const tooEarly = complete.error instanceof ApiError && complete.error.status === 409;

  function submit(e: FormEvent) {
    e.preventDefault();
    complete.mutate();
  }

  return (
    <form className="lab-form" onSubmit={submit}>
      <label className="editor-field">
        {t(`labTests.timed.endReading.${test.kind}` as MessageKey)}
        <input type="text" inputMode="decimal" dir="ltr" value={endReading} onChange={(e) => setEndReading(e.target.value)} />
      </label>
      <label className="editor-field">
        {t("labTests.timed.outcome")}
        <select value={outcome} onChange={(e) => setOutcome(e.target.value as TimedTestOutcome)}>
          <option value="passed">{t("labTests.timed.outcome.passed")}</option>
          <option value="failed">{t("labTests.timed.outcome.failed")}</option>
        </select>
      </label>
      <label className="editor-field">
        {t("labTests.note")}
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {complete.isError && <p className="form-error">{t(tooEarly ? "labTests.timed.tooEarly" : "labTests.actionFailed")}</p>}
      <div className="editor-actions">
        <button
          type="submit"
          className="primary"
          disabled={(test.kind === "pressure" && reading === undefined) || complete.isPending}
        >
          {t("labTests.timed.completeSubmit")}
        </button>
        <button type="button" onClick={onClose} disabled={complete.isPending}>
          {t("labTests.cancel")}
        </button>
      </div>
    </form>
  );
}

function TimedTestCard({ projectId, test, isReviewer, now }: { projectId: string; test: TimedTestSummary; isReviewer: boolean; now: number }) {
  const [completing, setCompleting] = useState(false);
  const dueMs = new Date(test.dueAt).getTime();
  const status = test.status === "running" && dueMs <= now ? "due" : test.status;
  const running = status === "running";
  const finished = status === "passed" || status === "failed";
  const pressureDrop =
    test.kind === "pressure" &&
    status === "failed" &&
    test.startReading !== null &&
    test.endReading !== null &&
    test.endReading < test.startReading;

  return (
    <div className="card lab-card">
      <div className="lab-head">
        <div>
          <div className="lab-title">
            {t(`labTests.timed.kind.${test.kind}` as MessageKey)} · {test.location}
          </div>
          <div className="item-meta">
            <span>
              {t("labTests.timed.startedAt")} {formatDateTime(test.startedAt)}
            </span>
            <span>
              {t("labTests.timed.dueAt")} {formatDateTime(test.dueAt)}
            </span>
          </div>
        </div>
        <span className={`lab-chip timed-${status}`}>{t(`labTests.timed.status.${status}` as MessageKey)}</span>
      </div>
      <div className="item-meta">
        {test.startReading !== null && (
          <span>
            {t("labTests.timed.startReading")}: <bdi>{test.startReading} {test.unit}</bdi>
          </span>
        )}
        {test.endReading !== null && (
          <span>
            {t("labTests.timed.endReading")}: <bdi>{test.endReading} {test.unit}</bdi>
          </span>
        )}
        {running && (
          <span>
            {t("labTests.timed.remaining")} {formatRemaining(dueMs - now)}
          </span>
        )}
        {test.note && <span>{test.note}</span>}
      </div>
      {pressureDrop && <p className="form-error">{t("labTests.timed.pressureDrop")}</p>}
      {isReviewer && !finished && !completing && (
        <div className="editor-actions">
          <button type="button" className="primary" disabled={running} onClick={() => setCompleting(true)}>
            {t("labTests.timed.complete")}
          </button>
          {running && (
            <p className="hint">
              {t("labTests.timed.notYet")} {formatDateTime(test.dueAt)}
            </p>
          )}
        </div>
      )}
      {completing && <CompleteTestForm projectId={projectId} test={test} onClose={() => setCompleting(false)} />}
    </div>
  );
}

function TimedSection({ projectId, isReviewer }: { projectId: string; isReviewer: boolean }) {
  const [starting, setStarting] = useState(false);
  const now = useNow();
  const tests = useQuery({
    queryKey: ["timed-tests", projectId],
    queryFn: () => api.listTimedTests(projectId),
    refetchInterval: REFETCH_MS,
  });

  if (tests.isLoading) return <div className="page-loading">{t("labTests.loading")}</div>;
  if (tests.isError || !tests.data) return <div className="page-error">{t("labTests.error")}</div>;

  const sorted = [...tests.data].sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  return (
    <section className="section">
      {isReviewer && !starting && (
        <div className="editor-actions">
          <button type="button" className="primary" onClick={() => setStarting(true)}>
            {t("labTests.timed.start")}
          </button>
        </div>
      )}
      {starting && <StartTestForm projectId={projectId} onClose={() => setStarting(false)} />}
      {sorted.length === 0 && <p className="sub">{t("labTests.timed.empty")}</p>}
      <div className="grid">
        {sorted.map((test) => (
          <TimedTestCard key={test.id} projectId={projectId} test={test} isReviewer={isReviewer} now={now} />
        ))}
      </div>
    </section>
  );
}

export function LabTestsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { isReviewer } = useMyProjectRole(projectId);
  const [tab, setTab] = useState<"concrete" | "timed">("concrete");

  return (
    <div className="wrap">
      <h1>{t("labTests.title")}</h1>
      <p className="sub">{t("labTests.subtitle")}</p>
      <div className="segmented" role="tablist">
        {(["concrete", "timed"] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {t(`labTests.tab.${key}` as MessageKey)}
          </button>
        ))}
      </div>
      {tab === "concrete" ? (
        <ConcreteSection projectId={projectId!} isReviewer={isReviewer} />
      ) : (
        <TimedSection projectId={projectId!} isReviewer={isReviewer} />
      )}
    </div>
  );
}
