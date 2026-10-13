import { useRef, useState, type PointerEvent } from "react";
import type { PhotoMarkupShape } from "@buildguard/shared-types";
import { t } from "../i18n/he";

type Tool = "arrow" | "circle" | "text";

const TOOLS: Tool[] = ["arrow", "circle", "text"];
const ARROW_HEAD = 0.04;
const TEXT_SIZE = 0.05;
const MIN_SIZE = 0.01;

interface Props {
  src: string;
  shapes: PhotoMarkupShape[];
  onChange?: (shapes: PhotoMarkupShape[]) => void;
}

interface Point {
  x: number;
  y: number;
}

function ShapeView({ shape, aspect }: { shape: PhotoMarkupShape; aspect: number }) {
  if (shape.type === "arrow") {
    const angle = Math.atan2((shape.y2 - shape.y1) * aspect, shape.x2 - shape.x1);
    const head = [-0.5, 0.5].map((spread) => {
      const a = angle + Math.PI + spread;
      return `${shape.x2 + ARROW_HEAD * Math.cos(a)},${shape.y2 + (ARROW_HEAD * Math.sin(a)) / aspect}`;
    });
    return (
      <g className="markup-shape">
        <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} />
        <polyline points={`${head[0]} ${shape.x2},${shape.y2} ${head[1]}`} />
      </g>
    );
  }
  if (shape.type === "circle") {
    return <ellipse className="markup-shape" cx={shape.x} cy={shape.y} rx={shape.r} ry={shape.r / aspect} />;
  }
  return (
    <text
      className="markup-text"
      transform={`translate(${shape.x} ${shape.y}) scale(1 ${1 / aspect})`}
      fontSize={TEXT_SIZE}
    >
      {shape.text}
    </text>
  );
}

export function PhotoMarkup({ src, shapes, onChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [aspect, setAspect] = useState(0.75);
  const [tool, setTool] = useState<Tool>("arrow");
  const [start, setStart] = useState<Point | null>(null);
  const [draft, setDraft] = useState<PhotoMarkupShape | null>(null);
  const [textAt, setTextAt] = useState<Point | null>(null);
  const [label, setLabel] = useState("");

  function toFraction(e: PointerEvent): Point {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }

  function shapeFor(from: Point, to: Point): PhotoMarkupShape | null {
    if (tool === "arrow") return { type: "arrow", x1: from.x, y1: from.y, x2: to.x, y2: to.y };
    if (tool === "circle") return { type: "circle", x: from.x, y: from.y, r: Math.hypot(to.x - from.x, (to.y - from.y) * aspect) };
    return null;
  }

  function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    const point = toFraction(e);
    if (tool === "text") {
      setTextAt(point);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    setStart(point);
    setDraft(shapeFor(point, point));
  }

  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    if (start) setDraft(shapeFor(start, toFraction(e)));
  }

  function onPointerUp() {
    if (draft && onChange) {
      const size = draft.type === "arrow" ? Math.hypot(draft.x2 - draft.x1, (draft.y2 - draft.y1) * aspect) : draft.type === "circle" ? draft.r : 0;
      if (size >= MIN_SIZE) onChange([...shapes, draft]);
    }
    setStart(null);
    setDraft(null);
  }

  function addText() {
    const text = label.trim();
    if (text && textAt && onChange) onChange([...shapes, { type: "text", x: textAt.x, y: textAt.y, text }]);
    setTextAt(null);
    setLabel("");
  }

  return (
    <div className="photo-markup">
      {onChange && (
        <div className="markup-toolbar">
          {TOOLS.map((tl) => (
            <button
              key={tl}
              type="button"
              className={tool === tl ? "active" : ""}
              aria-pressed={tool === tl}
              onClick={() => setTool(tl)}
            >
              {t(`photos.markup.${tl}`)}
            </button>
          ))}
          <button type="button" onClick={() => onChange(shapes.slice(0, -1))} disabled={shapes.length === 0}>
            {t("photos.markup.undo")}
          </button>
          <button type="button" onClick={() => onChange([])} disabled={shapes.length === 0}>
            {t("photos.markup.clear")}
          </button>
        </div>
      )}
      <div className="photo-stage">
        <img
          src={src}
          alt={t("photos.imageAlt")}
          onLoad={(e) => setAspect(e.currentTarget.naturalHeight / e.currentTarget.naturalWidth)}
        />
        <svg
          ref={svgRef}
          className={onChange ? "markup-overlay editing" : "markup-overlay"}
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          onPointerDown={onChange ? onPointerDown : undefined}
          onPointerMove={onChange ? onPointerMove : undefined}
          onPointerUp={onChange ? onPointerUp : undefined}
          onPointerCancel={onChange ? onPointerUp : undefined}
        >
          {shapes.map((shape, i) => (
            <ShapeView key={i} shape={shape} aspect={aspect} />
          ))}
          {draft && <ShapeView shape={draft} aspect={aspect} />}
        </svg>
      </div>
      {onChange && textAt && (
        <form
          className="markup-text-form"
          onSubmit={(e) => {
            e.preventDefault();
            addText();
          }}
        >
          <input
            type="text"
            autoFocus
            value={label}
            placeholder={t("photos.markup.textPlaceholder")}
            aria-label={t("photos.markup.textPlaceholder")}
            onChange={(e) => setLabel(e.target.value)}
          />
          <button type="submit" className="primary" disabled={!label.trim()}>
            {t("photos.markup.addText")}
          </button>
        </form>
      )}
    </div>
  );
}
