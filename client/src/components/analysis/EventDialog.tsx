import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { DateRangePicker, type DateRange } from "@/components/ui/date-range-picker";
import { EVENT_CATEGORIES, MANUAL_EVENT_TYPES } from "@/lib/event-categories";
import { isRangeType, type ChartEvent, type EventType } from "@shared/events";
import type { NewChartEvent } from "@/hooks/useChartEvents";

const TITLE_PLACEHOLDERS: Partial<Record<EventType, string>> = {
  food: "e.g. Switched to a new dry food",
  medication: "e.g. Started antibiotics",
  vet: "e.g. Annual checkup",
  travel: "e.g. Out of town",
  note: "e.g. Moved the fountain",
};

function toKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function fromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function EventDialog({
  open,
  onOpenChange,
  editing,
  defaultDateKey,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The event being edited, or null to create one. */
  editing: ChartEvent | null;
  /** Pre-filled day for a new event — e.g. the day clicked on the chart. */
  defaultDateKey: string;
  onSave: (input: NewChartEvent) => void;
  onDelete?: () => void;
}) {
  const [type, setType] = useState<EventType>("food");
  const [date, setDate] = useState<Date | undefined>();
  const [range, setRange] = useState<DateRange | undefined>();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");

  // Reset the form each time it opens, from the event or the clicked day.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setType(editing.type);
      setDate(fromKey(editing.startDate));
      setRange({ from: fromKey(editing.startDate), to: fromKey(editing.endDate ?? editing.startDate) });
      setTitle(editing.title);
      setNote(editing.note ?? "");
    } else {
      setType("food");
      setDate(fromKey(defaultDateKey));
      setRange({ from: fromKey(defaultDateKey), to: undefined });
      setTitle("");
      setNote("");
    }
  }, [open, editing, defaultDateKey]);

  const isRange = isRangeType(type);
  const datesValid = isRange ? Boolean(range?.from && range?.to) : Boolean(date);
  const canSave = title.trim().length > 0 && datesValid;

  const handleSave = () => {
    if (!canSave) return;
    const startDate = isRange ? toKey(range!.from!) : toKey(date!);
    onSave({
      type,
      startDate,
      endDate: isRange ? toKey(range!.to!) : undefined,
      title: title.trim(),
      note: note.trim() || undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit event" : "Add event"}</DialogTitle>
          <DialogDescription>
            Events appear as markers on the chart, so changes in drinking can be read against what
            was going on at the time.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={v => setType(v as EventType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MANUAL_EVENT_TYPES.map(t => {
                  const cat = EVENT_CATEGORIES[t];
                  const Icon = cat.icon;
                  return (
                    <SelectItem key={t} value={t}>
                      <span className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5" style={{ color: cat.color }} />
                        {cat.label}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{isRange ? "Dates" : "Date"}</Label>
            {isRange ? (
              <DateRangePicker
                range={range}
                onSelect={setRange}
                disabled={d => d > new Date()}
                className="h-9 w-full text-sm"
              />
            ) : (
              <DatePicker
                date={date}
                onSelect={setDate}
                disabled={d => d > new Date()}
                className="w-full"
              />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-title">Title</Label>
            <Input
              id="event-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={TITLE_PLACEHOLDERS[type]}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-note">
              Note <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="event-note"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Dose, brand, what the vet said…"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          {editing && onDelete ? (
            <Button
              variant="ghost"
              className="text-red-400 hover:text-red-300 gap-1.5"
              onClick={() => {
                onDelete();
                onOpenChange(false);
              }}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!canSave}>
              {editing ? "Save" : "Add event"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
