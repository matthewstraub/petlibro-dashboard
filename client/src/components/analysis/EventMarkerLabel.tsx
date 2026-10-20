import type { MouseEvent } from "react";
import { EVENT_CATEGORIES, EVENT_TYPE_ORDER } from "@/lib/event-categories";
import { formatDateKey } from "@shared/dates";
import type { ChartEvent } from "@shared/events";

/** The chart card's composited surface, so a chip reads as punched out of it. */
const SURFACE = "#080c10";

/** Height reserved above the plot for event chips: two rows. */
export const EVENT_LANE_HEIGHT = 44;
/** Horizontal room one chip needs before the next must move to another row. */
export const CHIP_SPAN_PX = 22;

/** The event a day's chip shows: life events beat maintenance, then fixed type order. */
export function leadEvent(events: ChartEvent[]): ChartEvent {
  const ranked = [...events].sort(
    (a, b) => EVENT_TYPE_ORDER.indexOf(a.type) - EVENT_TYPE_ORDER.indexOf(b.type)
  );
  return ranked.find(e => !EVENT_CATEGORIES[e.type].recessive) ?? ranked[0];
}

/**
 * A day's chip in the event lane above the plot, with a hairline connector down
 * to the plot's top edge where the event's reference line begins.
 *
 * Recharts clones this element and injects `viewBox` (the reference element's
 * position, whose `y` is the plot's top edge), so it is an SVG fragment.
 *
 * Chips live in their own lane rather than inside the plot so they never sit on
 * top of tall bars. One chip per day: when several events share a day, the lead
 * event's icon shows with a count, and the tooltip lists them all.
 */
export function EventMarkerLabel({
  viewBox,
  events,
  onSelect,
  inset = 0,
  row = 0,
}: {
  viewBox?: { x: number; y: number };
  events: ChartEvent[];
  onSelect?: (event: ChartEvent) => void;
  /** Horizontal offset from viewBox.x — a band's chip sits just inside its left edge. */
  inset?: number;
  /** Lane row, 0 (top) or 1, assigned by the page so nearby chips don't collide. */
  row?: number;
}) {
  if (!viewBox || events.length === 0) return null;

  const x = viewBox.x + inset;
  const plotTop = viewBox.y;
  const lead = leadEvent(events);
  const cat = EVENT_CATEGORIES[lead.type];
  const Icon = cat.icon;
  const r = cat.recessive ? 7 : 8;
  const cy = plotTop - EVENT_LANE_HEIGHT + 10 + row * 20;
  const iconSize = (r - 2.5) * 2;

  // Petlibro events are read-only; only hand-entered ones open for editing.
  const editable = Boolean(onSelect) && lead.source === "manual";
  const handle = (e: MouseEvent) => {
    // Don't let the chart's own click (add event on this day) fire too.
    e.stopPropagation();
    if (editable) onSelect!(lead);
  };

  // Native SVG tooltip: cheap, accessible, works when hovering the chip itself.
  const summary = `${formatDateKey(events[0].startDate, { month: "short", day: "numeric" })}\n${events
    .map(e => `${EVENT_CATEGORIES[e.type].label}: ${e.title}`)
    .join("\n")}`;

  return (
    <g onClick={handle} style={{ cursor: editable ? "pointer" : "default" }}>
      <title>{summary}</title>
      {/* connector from the chip down to where the reference line starts */}
      <line
        x1={x}
        y1={cy + r}
        x2={x}
        y2={plotTop}
        stroke={cat.color}
        strokeOpacity={cat.recessive ? 0.45 : 0.7}
        strokeWidth={1}
        strokeDasharray="2 2"
      />
      {/* 2px surface ring so a chip stays legible over a neighbour's connector */}
      <circle cx={x} cy={cy} r={r + 2} fill={SURFACE} />
      <circle
        cx={x}
        cy={cy}
        r={r}
        fill={SURFACE}
        stroke={cat.color}
        strokeWidth={1.5}
        strokeOpacity={cat.recessive ? 0.85 : 1}
      />
      <Icon
        x={x - iconSize / 2}
        y={cy - iconSize / 2}
        width={iconSize}
        height={iconSize}
        color={cat.color}
        strokeWidth={2.25}
      />
      {events.length > 1 && (
        <g>
          <circle cx={x + r} cy={cy - r + 1} r={5} fill={SURFACE} stroke="#c3c2b7" strokeWidth={1} />
          <text
            x={x + r}
            y={cy - r + 1}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={7}
            fontWeight={600}
            fill="#c3c2b7"
          >
            {events.length}
          </text>
        </g>
      )}
    </g>
  );
}
