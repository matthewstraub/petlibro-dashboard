import {
  Filter,
  Sparkles,
  Utensils,
  Pill,
  Stethoscope,
  Plane,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import { MANUAL_EVENT_TYPES as SHARED_MANUAL_TYPES, type EventSource, type EventType } from "@shared/events";

export interface EventCategory {
  type: EventType;
  label: string;
  /** Short noun used in counts and the add form. */
  noun: string;
  /** Marker color. Text never wears it — labels stay in text tokens. */
  color: string;
  icon: LucideIcon;
  source: EventSource;
  /** Recessive markers draw thinner and fainter so frequent events don't dominate. */
  recessive: boolean;
}

/*
 * Palette, validated with the dataviz skill's validate_palette.js against the
 * real chart surface (#080c10, glass-card over the page plane), dark mode:
 *
 *   yellow #c98500 · magenta #d55181 · violet #9085e9
 *   all-pairs: CVD ΔE 13.2, normal-vision ΔE 19.3 — every check passes.
 *
 * The existing series are all teal/cyan (bars #0092a8, 7-day #61c3aa, 30-day
 * #00aaab), so marker hues come from the opposite side of the wheel. Worst
 * marker↔series normal-vision ΔE is 16.6. One CVD pair (magenta vs the 30-day
 * line, 6.5) sits in the floor band, which is legal only with secondary
 * encoding — markers have it twice: they are vertical dashed lines against a
 * solid horizontal trend line, and every marker carries an icon.
 *
 * Seven types share four color families because past three hues the all-pairs
 * floors cannot be met; icons carry the type within a family (Vet vs
 * Medication, Filter vs Cleaning). Orange was the obvious first pick and was
 * rejected by the validator: orange↔magenta measured ΔE 11.6, below the floor
 * of 15 even for full color vision.
 *
 * Fountain maintenance is neutral on purpose: it recurs every couple of weeks,
 * so on a long range it is context, not story.
 */
const NEUTRAL = "#898781";
const YELLOW = "#c98500";
const MAGENTA = "#d55181";
const VIOLET = "#9085e9";

export const EVENT_CATEGORIES: Record<EventType, EventCategory> = {
  filter: {
    type: "filter",
    label: "Filter replaced",
    noun: "filter",
    color: NEUTRAL,
    icon: Filter,
    source: "petlibro",
    recessive: true,
  },
  cleaning: {
    type: "cleaning",
    label: "Fountain cleaned",
    noun: "cleaning",
    color: NEUTRAL,
    icon: Sparkles,
    source: "petlibro",
    recessive: true,
  },
  food: {
    type: "food",
    label: "Food change",
    noun: "food change",
    color: YELLOW,
    icon: Utensils,
    source: "manual",
    recessive: false,
  },
  medication: {
    type: "medication",
    label: "Medication",
    noun: "medication",
    color: MAGENTA,
    icon: Pill,
    source: "manual",
    recessive: false,
  },
  vet: {
    type: "vet",
    label: "Vet visit",
    noun: "vet visit",
    color: MAGENTA,
    icon: Stethoscope,
    source: "manual",
    recessive: false,
  },
  travel: {
    type: "travel",
    label: "Travel",
    noun: "trip",
    color: NEUTRAL,
    icon: Plane,
    source: "manual",
    recessive: false,
  },
  note: {
    type: "note",
    label: "Note",
    noun: "note",
    color: VIOLET,
    icon: StickyNote,
    source: "manual",
    recessive: false,
  },
};

/** Fixed display order. Color follows the type, never its position in a filtered list. */
export const EVENT_TYPE_ORDER: EventType[] = [
  "filter",
  "cleaning",
  "food",
  "medication",
  "vet",
  "travel",
  "note",
];

/** Types a person can create by hand, in the order the add form offers them. */
export const MANUAL_EVENT_TYPES: readonly EventType[] = SHARED_MANUAL_TYPES;
