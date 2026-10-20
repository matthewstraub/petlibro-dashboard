/**
 * Chart events for the Analysis page: fountain maintenance recorded by the sync,
 * plus events logged by hand. All of a user's events are fetched once (a few
 * dozen a year) and filtered to the visible range client-side.
 */
import { useCallback } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import type { ChartEvent } from "@shared/events";

export type NewChartEvent = Omit<ChartEvent, "id" | "source">;

export function useChartEvents() {
  const utils = trpc.useUtils();
  const list = trpc.events.list.useQuery(undefined, { staleTime: 60_000 });

  const refresh = () => utils.events.list.invalidate();
  const fail = (err: { message: string }) => toast.error(err.message || "Couldn't save the event");

  const create = trpc.events.create.useMutation({
    onSuccess: () => {
      toast.success("Event added");
      refresh();
    },
    onError: fail,
  });
  const update = trpc.events.update.useMutation({
    onSuccess: () => {
      toast.success("Event updated");
      refresh();
    },
    onError: fail,
  });
  const remove = trpc.events.delete.useMutation({
    onSuccess: () => {
      toast.success("Event deleted");
      refresh();
    },
    onError: fail,
  });

  const addEvent = useCallback((input: NewChartEvent) => create.mutate(input), [create]);
  const updateEvent = useCallback(
    (id: string, input: NewChartEvent) => update.mutate({ id: Number(id), ...input }),
    [update]
  );
  const removeEvent = useCallback((id: string) => remove.mutate({ id: Number(id) }), [remove]);

  return {
    events: list.data ?? [],
    isLoading: list.isLoading,
    addEvent,
    updateEvent,
    removeEvent,
  };
}
