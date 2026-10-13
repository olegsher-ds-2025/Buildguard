"""Extracts the supervision checklist (checklist-1-15.docx) into checklist.he.json.

    uv run --with python-docx extract_checklist.py /path/to/checklist-1-15.docx

The docx structure is regular: "N. title" stage headings, "תקנים:" lines, short
headings (sub-stage or לפני/במהלך/אחרי phase), "☐" items, and tail lines for
common defects and hold points. Item type and numeric thresholds are inferred
by keyword/regex and are a starting point for human review, not ground truth.
"""
import json
import re
import sys
from decimal import Decimal
from pathlib import Path

import docx

PHASE_PREFIXES = ("לפני", "במהלך", "אחרי", "שלב", "גמר", "ביצוע", "קבלה", "התקנה", "שכבות")
BEFORE = ("לפני",)
AFTER = ("אחרי", "גמר", "קבלה")
UNITS = r'(%|מ"מ|ס"מ|מ"ר|מ\'|שניות|שעות|ימים|מגפ"ס|ממ"ר|ק"ג|אטמ\')'
THRESHOLD_RE = re.compile(r"(≥|≤|<|>)\s*~?\s*(\d+(?:\.\d+)?)(?:\s*%?\s*[–-]\s*~?(\d+(?:\.\d+)?))?\s*" + UNITS + "?")
STANDARD_RE = re.compile(r'ת"י\s*\d+(?:\s*ח"\d+)?')
BEFORE_COVER_RE = re.compile(r"מתועדת בצילום|צילום כל תוואי|תיעוד מצולם")
COST_RE = re.compile(r"(\d+)[–-](\d+)\s*אלף\s*₪")


def phase_kind(heading):
    if heading is None:
        return "general"
    if heading.startswith(BEFORE):
        return "before"
    if heading.startswith(AFTER):
        return "after"
    return "during"


def infer_type(text, thresholds):
    if thresholds:
        return "measurement"
    if "מעבדה" in text or "פרוקטור" in text or "קוביות" in text:
        return "lab_test"
    if "אישור בכתב" in text or re.search(r"אישור (מהנדס|יועץ|מודד|קונסטרוקטור|בודק)", text):
        return "written_approval"
    if re.search(r"תעוד|תעודת|תעודות|תיק|יומן|תוכנית", text):
        return "document"
    return "visual"


def extract_thresholds(text):
    """Every comparison in the text, with its source snippet. Candidates only:
    one item can hold several measures and ranges, so these need human review."""
    found = []
    for m in THRESHOLD_RE.finditer(text):
        op, value, upper, unit = m.groups()
        found.append(
            {
                "op": op,
                "value": float(Decimal(value)),
                "upperValue": float(Decimal(upper)) if upper else None,
                "unit": unit,
                "raw": m.group(0).strip(),
            }
        )
    return found


def split_dots(text):
    return [p.strip().rstrip(".").strip() for p in text.split(" · ") if p.strip()]


def parse(path):
    stages = []
    stage = None
    sub_stage = None
    phase_heading = None
    for para in docx.Document(path).paragraphs:
        text = para.text.strip()
        if not text:
            continue
        m = re.match(r"^(\d+)\.\s+(.+)$", text)
        if m and 1 <= int(m.group(1)) <= 15 and "☐" not in text:
            stage = {
                "stageNo": int(m.group(1)),
                "title": m.group(2),
                "standards": [],
                "notes": [],
                "items": [],
                "commonDefects": [],
                "holdPoints": [],
            }
            stages.append(stage)
            sub_stage = phase_heading = None
            continue
        if stage is None:
            continue
        if text.startswith("☐"):
            body = text.lstrip("☐").strip()
            thresholds = extract_thresholds(body)
            std = STANDARD_RE.search(body)
            stage["items"].append(
                {
                    "sortOrder": len(stage["items"]),
                    "subStage": sub_stage,
                    "section": phase_heading,
                    "phaseKind": phase_kind(phase_heading),
                    "text": body,
                    "standardRef": std.group(0) if std else None,
                    "itemType": infer_type(body, thresholds),
                    "thresholds": thresholds,
                    "requiresBeforeCoverPhoto": bool(BEFORE_COVER_RE.search(body)),
                }
            )
        elif text.startswith("תקנים:"):
            for ref in split_dots(text.removeprefix("תקנים:")):
                stage["standards"].append({"text": ref, "subStage": sub_stage})
        elif text.startswith(("טעויות נפוצות:", "ליקויים נפוצים:")):
            for d in split_dots(text.split(":", 1)[1]):
                cost = COST_RE.search(d)
                stage["commonDefects"].append(
                    {
                        "subStage": sub_stage,
                        "text": d,
                        "costMinMinor": int(cost.group(1)) * 1000 * 100 if cost else None,
                        "costMaxMinor": int(cost.group(2)) * 1000 * 100 if cost else None,
                    }
                )
        elif text.startswith("🛑"):
            head, body = text.split(":", 1)
            parts = split_dots(body) if "נקודות" in head else [body.strip()]
            for h in parts:
                stage["holdPoints"].append({"sortOrder": len(stage["holdPoints"]), "subStage": sub_stage, "text": h})
        elif len(text) <= 90 and ":" not in text.split("—")[0][-40:] and not text.endswith("."):
            if text.startswith(PHASE_PREFIXES) and not (text == "גמר שלד"):
                phase_heading = text
            else:
                sub_stage, phase_heading = text, None
        else:
            stage["notes"].append({"subStage": sub_stage, "text": text})
    return stages


if __name__ == "__main__":
    stages = parse(sys.argv[1])
    out = Path(__file__).with_name("checklist.he.json")
    out.write_text(json.dumps(stages, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for s in stages:
        print(s["stageNo"], s["title"][:30], len(s["items"]), len(s["holdPoints"]), len(s["commonDefects"]), len(s["notes"]))
