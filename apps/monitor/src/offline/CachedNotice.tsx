import { t } from "../i18n/he";

export function CachedNotice({ show }: { show: boolean }) {
  return show ? <p className="item-meta">{t("offline.cachedNotice")}</p> : null;
}
