import { useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { ApiError } from "@buildguard/api-client";
import { WEATHER_CHOICES, weatherLabelHe } from "@buildguard/shared-types";
import type { DailyLogSummary, HeadcountEntry, SaveDailyLogRequest } from "@buildguard/shared-types";
import { api } from "../api";
import { useDownload } from "../downloadBlob";
import { formatDate, formatDateTime } from "../format";
import { t } from "../i18n/he";
import { useMyProjectRole } from "../useMyProjectRole";

type Safety = "unset" | "ok" | "issues";

interface HeadcountRow {
  name: string;
  workers: string;
}

interface FormState {
  weatherCode: string;
  temperature: string;
  headcount: HeadcountRow[];
  workDone: string;
  safety: Safety;
  safetyNotes: string;
}

const HASH_PREVIEW = 12;
const NOT_FOUND = 404;
const CONFLICT = 409;

function todayInJerusalem(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
}

function formatLogDate(logDate: string): string {
  return formatDate(`${logDate}T12:00:00Z`);
}

function totalWorkers(log: DailyLogSummary): number {
  return log.headcount.reduce((sum, h) => sum + h.workers, 0);
}

function safetyOf(log: DailyLogSummary): Safety {
  if (log.safetyOk === null) return "unset";
  return log.safetyOk ? "ok" : "issues";
}

function toFormState(log?: DailyLogSummary): FormState {
  return {
    weatherCode: log?.weatherCode == null ? "" : String(log.weatherCode),
    temperature: log?.temperatureC == null ? "" : String(log.temperatureC),
    headcount: (log?.headcount ?? []).map((h) => ({ name: h.name, workers: String(h.workers) })),
    workDone: log?.workDone ?? "",
    safety: log ? safetyOf(log) : "unset",
    safetyNotes: log?.safetyNotes ?? "",
  };
}

function toRequest(form: FormState): SaveDailyLogRequest {
  const temperature = Number(form.temperature.replace(",", "."));
  const headcount: HeadcountEntry[] = form.headcount
    .filter((row) => row.name.trim() !== "")
    .map((row) => ({ name: row.name.trim(), workers: Math.max(0, Math.floor(Number(row.workers) || 0)) }));
  return {
    weatherCode: form.weatherCode === "" ? null : Number(form.weatherCode),
    temperatureC: form.temperature.trim() === "" || !Number.isFinite(temperature) ? null : temperature,
    headcount,
    workDone: form.workDone,
    safetyOk: form.safety === "unset" ? null : form.safety === "ok",
    safetyNotes: form.safetyNotes.trim() === "" ? null : form.safetyNotes.trim(),
  };
}

function LogFields({
  form,
  setForm,
  readOnly,
  weatherAction,
}: {
  form: FormState;
  setForm: (next: FormState) => void;
  readOnly: boolean;
  weatherAction?: ReactNode;
}) {
  const patch = (changes: Partial<FormState>) => setForm({ ...form, ...changes });
  const updateRow = (index: number, changes: Partial<HeadcountRow>) =>
    patch({ headcount: form.headcount.map((row, i) => (i === index ? { ...row, ...changes } : row)) });
  const currentCode = form.weatherCode === "" ? null : Number(form.weatherCode);
  const codes = currentCode !== null && !WEATHER_CHOICES.includes(currentCode) ? [currentCode, ...WEATHER_CHOICES] : WEATHER_CHOICES;

  return (
    <>
      <div className="editor-row">
        <label className="editor-field">
          {t("dailyLogs.weather")}
          <select value={form.weatherCode} disabled={readOnly} onChange={(e) => patch({ weatherCode: e.target.value })}>
            <option value="">{t("dailyLogs.weatherUnset")}</option>
            {codes.map((code) => (
              <option key={code} value={code}>
                {weatherLabelHe(code)}
              </option>
            ))}
          </select>
        </label>
        <label className="editor-field">
          {t("dailyLogs.temperature")}
          <input
            type="text"
            inputMode="decimal"
            dir="ltr"
            value={form.temperature}
            disabled={readOnly}
            onChange={(e) => patch({ temperature: e.target.value })}
          />
        </label>
      </div>
      {!readOnly && weatherAction}

      <div className="group-title">{t("dailyLogs.headcount")}</div>
      {form.headcount.map((row, i) => (
        <div className="log-headcount-row" key={i}>
          <input
            type="text"
            aria-label={t("dailyLogs.headcountName")}
            placeholder={t("dailyLogs.headcountName")}
            value={row.name}
            disabled={readOnly}
            onChange={(e) => updateRow(i, { name: e.target.value })}
          />
          <input
            type="text"
            inputMode="numeric"
            dir="ltr"
            aria-label={t("dailyLogs.headcountWorkers")}
            placeholder={t("dailyLogs.headcountWorkers")}
            value={row.workers}
            disabled={readOnly}
            onChange={(e) => updateRow(i, { workers: e.target.value })}
          />
          {!readOnly && (
            <button type="button" onClick={() => patch({ headcount: form.headcount.filter((_, j) => j !== i) })}>
              {t("dailyLogs.removeRow")}
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <div className="editor-actions">
          <button type="button" onClick={() => patch({ headcount: [...form.headcount, { name: "", workers: "" }] })}>
            {t("dailyLogs.addRow")}
          </button>
        </div>
      )}

      <label className="editor-field">
        {t("dailyLogs.workDone")}
        <textarea rows={4} value={form.workDone} disabled={readOnly} onChange={(e) => patch({ workDone: e.target.value })} />
      </label>

      <div className="group-title">{t("dailyLogs.safety")}</div>
      <div className="segmented">
        {(["issues", "ok", "unset"] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={form.safety === value ? "active" : ""}
            aria-pressed={form.safety === value}
            disabled={readOnly}
            onClick={() => patch({ safety: value })}
          >
            {t(`dailyLogs.safety.${value}`)}
          </button>
        ))}
      </div>
      <label className="editor-field">
        {t("dailyLogs.safetyNotes")}
        <textarea rows={2} value={form.safetyNotes} disabled={readOnly} onChange={(e) => patch({ safetyNotes: e.target.value })} />
      </label>
    </>
  );
}

function PdfButton({ projectId, log }: { projectId: string; log: DailyLogSummary }) {
  const pdf = useDownload(() => api.downloadDailyLogPdf(projectId, log.id), `daily-log-${log.logDate}.pdf`);
  return (
    <>
      <button type="button" onClick={pdf.start} disabled={pdf.pending}>
        {t("dailyLogs.downloadPdf")}
      </button>
      {pdf.failed && <span className="form-error">{t("reports.downloadFailed")}</span>}
    </>
  );
}

function LogEditor({ projectId, log, canEdit, onClose }: { projectId: string; log: DailyLogSummary; canEdit: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => toFormState(log));
  const [confirming, setConfirming] = useState(false);
  const [weatherMissing, setWeatherMissing] = useState(false);
  const locked = log.status === "locked";
  const readOnly = locked || !canEdit;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["daily-logs", projectId] });

  const save = useMutation({
    mutationFn: () => api.updateDailyLog(projectId, log.id, toRequest(form)),
    onSuccess: refresh,
  });
  const approve = useMutation({
    mutationFn: async () => {
      await api.updateDailyLog(projectId, log.id, toRequest(form));
      return api.approveDailyLog(projectId, log.id);
    },
    onSuccess: refresh,
  });
  const fetchWeather = useMutation({
    mutationFn: () => api.fetchDailyLogWeather(projectId, log.id),
    onMutate: () => setWeatherMissing(false),
    onSuccess: (fetched) => {
      setForm((prev) => ({ ...prev, ...pickWeather(fetched) }));
      void refresh();
    },
    onError: (err) => setWeatherMissing(err instanceof ApiError && err.status === NOT_FOUND),
  });

  const busy = save.isPending || approve.isPending;

  return (
    <div className="card log-editor">
      <div className="log-head">
        <h2>{formatLogDate(log.logDate)}</h2>
        <span className={`hp-chip ${locked ? "signed" : "open"}`}>{t(`dailyLogs.status.${log.status}`)}</span>
      </div>
      {locked && (
        <div className="alert warning">
          <div>🔒 {t("dailyLogs.locked")}</div>
          <div className="item-meta">
            {log.approvedAt && (
              <span>
                {t("dailyLogs.approvedAt")}
                {formatDateTime(log.approvedAt)}
              </span>
            )}
            {log.contentHash && (
              <span>
                {t("dailyLogs.contentHash")}: <code dir="ltr">{log.contentHash.slice(0, HASH_PREVIEW)}</code>
              </span>
            )}
          </div>
        </div>
      )}
      {!locked && !canEdit && <p className="disclaimer">{t("dailyLogs.readOnly")}</p>}

      <LogFields
        form={form}
        setForm={setForm}
        readOnly={readOnly}
        weatherAction={
          <div className="editor-actions">
            <button type="button" onClick={() => fetchWeather.mutate()} disabled={fetchWeather.isPending}>
              {t("dailyLogs.fetchWeather")}
            </button>
          </div>
        }
      />
      {weatherMissing && <p className="form-error">{t("dailyLogs.weatherUnavailable")}</p>}
      {fetchWeather.isError && !weatherMissing && <p className="form-error">{t("dailyLogs.saveFailed")}</p>}

      <div className="group-title">{t("dailyLogs.pours")}</div>
      {log.pours.length === 0 ? (
        <p className="hint">{t("dailyLogs.noPours")}</p>
      ) : (
        <ul className="log-pours">
          {log.pours.map((pour) => (
            <li key={pour.id}>
              {pour.element} · {pour.concreteGrade}
            </li>
          ))}
        </ul>
      )}

      {confirming && (
        <div className="alert warning">
          <div>{t("dailyLogs.approveWarning")}</div>
          <div className="editor-actions">
            <button type="button" className="danger-btn armed" disabled={busy} onClick={() => approve.mutate()}>
              {t("dailyLogs.approveConfirm")}
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirming(false)}>
              {t("dailyLogs.cancel")}
            </button>
          </div>
        </div>
      )}
      {save.isError && <p className="form-error">{saveErrorText(save.error)}</p>}
      {approve.isError && <p className="form-error">{t("dailyLogs.approveFailed")}</p>}
      {save.isSuccess && !save.isPending && <p className="hint">{t("dailyLogs.saved")}</p>}

      <div className="editor-actions">
        {!readOnly && (
          <>
            <button type="button" className="primary" disabled={busy} onClick={() => save.mutate()}>
              {t("dailyLogs.save")}
            </button>
            {!confirming && (
              <button type="button" disabled={busy} onClick={() => setConfirming(true)}>
                {t("dailyLogs.approve")}
              </button>
            )}
          </>
        )}
        <PdfButton projectId={projectId} log={log} />
        <button type="button" onClick={onClose}>
          {t("dailyLogs.back")}
        </button>
      </div>
    </div>
  );
}

function pickWeather(log: DailyLogSummary): Pick<FormState, "weatherCode" | "temperature"> {
  const { weatherCode, temperature } = toFormState(log);
  return { weatherCode, temperature };
}

function saveErrorText(err: unknown): string {
  return err instanceof ApiError && err.status === CONFLICT ? t("dailyLogs.locked") : t("dailyLogs.saveFailed");
}

function NewLogForm({ projectId, onCreated, onCancel }: { projectId: string; onCreated: (log: DailyLogSummary) => void; onCancel: () => void }) {
  const queryClient = useQueryClient();
  const [logDate, setLogDate] = useState(todayInJerusalem);
  const [form, setForm] = useState(() => toFormState());

  const create = useMutation({
    mutationFn: () => api.createDailyLog(projectId, { logDate, ...toRequest(form) }),
    onSuccess: async (log) => {
      await queryClient.invalidateQueries({ queryKey: ["daily-logs", projectId] });
      onCreated(log);
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  const duplicate = create.error instanceof ApiError && create.error.status === CONFLICT;

  return (
    <form className="card log-editor" onSubmit={submit}>
      <h2>{t("dailyLogs.new")}</h2>
      <label className="editor-field">
        {t("dailyLogs.date")}
        <input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
      </label>
      <LogFields form={form} setForm={setForm} readOnly={false} />
      {create.isError && <p className="form-error">{duplicate ? t("dailyLogs.duplicate") : t("dailyLogs.saveFailed")}</p>}
      <div className="editor-actions">
        <button type="submit" className="primary" disabled={!logDate || create.isPending}>
          {t("dailyLogs.create")}
        </button>
        <button type="button" onClick={onCancel} disabled={create.isPending}>
          {t("dailyLogs.cancel")}
        </button>
      </div>
    </form>
  );
}

function LogRow({ log, onOpen }: { log: DailyLogSummary; onOpen: () => void }) {
  const locked = log.status === "locked";
  return (
    <button type="button" className="card log-row" onClick={onOpen}>
      <div className="log-head">
        <strong>{formatLogDate(log.logDate)}</strong>
        <span className={`hp-chip ${locked ? "signed" : "open"}`}>{t(`dailyLogs.status.${log.status}`)}</span>
      </div>
      <div className="item-meta">
        <span>
          {weatherLabelHe(log.weatherCode)}
          {log.temperatureC !== null && ` · ${log.temperatureC}°C`}
        </span>
        <span>
          {totalWorkers(log)} {t("dailyLogs.workers")}
        </span>
      </div>
    </button>
  );
}

export function DailyLogsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { isReviewer } = useMyProjectRole(projectId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const logs = useQuery({
    queryKey: ["daily-logs", projectId],
    queryFn: () => api.listDailyLogs(projectId!),
    enabled: !!projectId,
  });

  if (logs.isLoading) return <div className="page-loading">{t("dailyLogs.loading")}</div>;
  if (logs.isError || !logs.data) return <div className="page-error">{t("dailyLogs.error")}</div>;

  const selected = logs.data.find((l) => l.id === selectedId);

  return (
    <div className="wrap">
      <h1>{t("dailyLogs.title")}</h1>
      <p className="sub">{t("dailyLogs.subtitle")}</p>

      {creating ? (
        <NewLogForm
          projectId={projectId!}
          onCreated={(log) => {
            setCreating(false);
            setSelectedId(log.id);
          }}
          onCancel={() => setCreating(false)}
        />
      ) : selected ? (
        <LogEditor key={`${selected.id}:${selected.status}`} projectId={projectId!} log={selected} canEdit={isReviewer} onClose={() => setSelectedId(null)} />
      ) : (
        <>
          {isReviewer && (
            <div className="editor-actions">
              <button type="button" className="primary" onClick={() => setCreating(true)}>
                {t("dailyLogs.new")}
              </button>
            </div>
          )}
          {logs.data.length === 0 && <p className="sub">{t("dailyLogs.empty")}</p>}
          <div className="grid">
            {logs.data.map((log) => (
              <LogRow key={log.id} log={log} onOpen={() => setSelectedId(log.id)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
