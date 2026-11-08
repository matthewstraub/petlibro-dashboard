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
  /**
   * Marker color, as a CSS variable so it follows the theme (index.css holds
   * both modes' values and their validation). Text never wears it — labels stay
   * in text tokens.
   */
  color: string;
  icon: LucideIcon;
  source: EventSource;
  /** Recessive markers draw thinner and fainter so frequent events don't dominate. */
  recessive: boolean;
}

/*
 * Four color families, defined per theme in index.css (--event-*) and validated
 * there, all-pairs, against each mode's card surface with the dataviz skill's
 * validate_palette.js.
 *
 * The series are green (Petlibro's brand), so marker hues stay off the green
 * axis: caramel for food, magenta for health, blue for notes. Yellow and gold
 * were tried for food and rejected — under deuteranopia they collapse into the
 * green lines.
 *
 * Seven types share four families because past three hues the all-pairs floors
 * cannot be met; icons carry the type within a family (Vet vs Medication,
 * Filter vs Cleaning).
 *
 * Fountain maintenance is neutral on purpose: it recurs every couple of weeks,
 * so on a long range it is context, not story.
 */
const NEUTRAL = "var(--event-neutral)";
const FOOD = "var(--event-food)";
const HEALTH = "var(--event-health)";
const NOTE = "var(--event-note)";

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
    color: FOOD,
    icon: Utensils,
    source: "manual",
    recessive: false,
  },
  medication: {
    type: "medication",
    label: "Medication",
    noun: "medication",
    color: HEALTH,
    icon: Pill,
    source: "manual",
    recessive: false,
  },
  vet: {
    type: "vet",
    label: "Vet visit",
    noun: "vet visit",
    color: HEALTH,
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
    color: NOTE,
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
