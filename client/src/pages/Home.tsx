import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Droplets,
  Clock,
  Hash,
  Timer,
  Wifi,
  WifiOff,
  AlertTriangle,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Filter,
  Sparkles,
  Activity,
  Info,
} from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import { useUnit } from "@/contexts/UnitContext";

export default function Home() {
  const { user } = useAuth();
  const { convert, label, unit, toggleUnit } = useUnit();
  const liveData = trpc.fountain.liveData.useQuery(undefined, {
    refetchInterval: 60000,
  });
  const eventsQuery = trpc.fountain.events.useQuery(undefined, {
    refetchInterval: 120000,
  });
  const syncMutation = trpc.fountain.syncToday.useMutation({
    onSuccess: () => {
      toast.success("Data synced successfully");
      liveData.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const drinkData = liveData.data?.drinkData;
  const status = liveData.data?.status;
  const hasError = liveData.data && "error" in liveData.data;
  const isLoading = liveData.isLoading;

  // Auto-sync on load
  useEffect(() => {
    if (drinkData && !syncMutation.isPending) {
      syncMutation.mutate();
    }
  }, [drinkData?.todayTotalMl]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Loading fountain data...</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="glass-card animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 w-24 bg-muted rounded" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-16 bg-muted rounded mt-2" />
                <div className="h-3 w-20 bg-muted rounded mt-3" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground mt-1">Welcome back, {user?.name}</p>
          </div>
        </div>
        <Card className="glass-card border-amber-500/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              <div>
                <p className="font-medium">Setup Required</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Please configure your Petlibro credentials in Settings to start tracking your fountain data.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const todayMl = drinkData?.todayTotalMl ?? 0;
  const yesterdayMl = drinkData?.yesterdayTotalMl ?? 0;
  const todayCount = drinkData?.todayTotalTimes ?? 0;
  const yesterdayCount = drinkData?.yesterdayTotalTimes ?? 0;
  const drinkingTime = drinkData?.petEatingTime ?? 0;
  const avgDuration = drinkData?.avgDrinkDuration ?? 0;

  const mlDiff = todayMl - yesterdayMl;
  const mlPercent = yesterdayMl > 0 ? ((mlDiff / yesterdayMl) * 100).toFixed(0) : "—";
  const countDiff = todayCount - yesterdayCount;

  // Maintenance alerts
  const alerts: { type: "warning" | "danger"; message: string }[] = [];
  if (status) {
    if (status.remainingFilterDays <= 3) {
      alerts.push({ type: "danger", message: `Filter replacement needed in ${status.remainingFilterDays} day${status.remainingFilterDays !== 1 ? "s" : ""}` });
    } else if (status.remainingFilterDays <= 7) {
      alerts.push({ type: "warning", message: `Filter replacement approaching (${status.remainingFilterDays} days remaining)` });
    }
    if (status.remainingCleaningDays <= 1) {
      alerts.push({ type: "danger", message: `Machine cleaning needed in ${status.remainingCleaningDays} day${status.remainingCleaningDays !== 1 ? "s" : ""}` });
    } else if (status.remainingCleaningDays <= 3) {
      alerts.push({ type: "warning", message: `Machine cleaning approaching (${status.remainingCleaningDays} days remaining)` });
    }
    if (status.weightPercent < 20) {
      alerts.push({ type: "danger", message: `Water level critically low (${status.weightPercent}%)` });
    } else if (status.weightPercent < 40) {
      alerts.push({ type: "warning", message: `Water level getting low (${status.weightPercent}%)` });
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            {user?.name ? `Welcome back, ${user.name}` : "Cat hydration overview"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleUnit}
            className="gap-1.5 text-xs"
          >
            {unit === "ml" ? "mL" : "fl oz"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => liveData.refetch()}
            disabled={liveData.isFetching}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${liveData.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Maintenance Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert, i) => (
            <Card key={i} className={`border ${alert.type === "danger" ? "border-red-500/40 bg-red-500/5" : "border-amber-500/40 bg-amber-500/5"}`}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className={`h-4 w-4 ${alert.type === "danger" ? "text-red-400" : "text-amber-400"}`} />
                  <span className={`text-sm font-medium ${alert.type === "danger" ? "text-red-300" : "text-amber-300"}`}>
                    {alert.message}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Today's Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="glass-card glow-primary">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Droplets className="h-4 w-4 text-primary" />
              Water Consumed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight">
              {convert(todayMl).toFixed(unit === "oz" ? 1 : 0)}<span className="text-lg font-normal text-muted-foreground ml-1">{label}</span>
            </div>
            <div className="flex items-center gap-1 mt-2 text-sm">
              {mlDiff > 0 ? (
                <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />
              ) : mlDiff < 0 ? (
                <ArrowDownRight className="h-3.5 w-3.5 text-red-400" />
              ) : (
                <Minus className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className={mlDiff > 0 ? "text-emerald-400" : mlDiff < 0 ? "text-red-400" : "text-muted-foreground"}>
                {mlPercent}% vs yesterday
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Hash className="h-4 w-4 text-chart-2" />
              Drinking Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight">
              {todayCount}<span className="text-lg font-normal text-muted-foreground ml-1">times</span>
            </div>
            <div className="flex items-center gap-1 mt-2 text-sm">
              {countDiff > 0 ? (
                <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />
              ) : countDiff < 0 ? (
                <ArrowDownRight className="h-3.5 w-3.5 text-red-400" />
              ) : (
                <Minus className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className={countDiff > 0 ? "text-emerald-400" : countDiff < 0 ? "text-red-400" : "text-muted-foreground"}>
                {countDiff > 0 ? "+" : ""}{countDiff} vs yesterday
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4 text-chart-4" />
              Total Drinking Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight">
              {drinkingTime}<span className="text-lg font-normal text-muted-foreground ml-1">sec</span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Cumulative time today
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Timer className="h-4 w-4 text-chart-3" />
              Avg Session Duration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight">
              {avgDuration}<span className="text-lg font-normal text-muted-foreground ml-1">sec</span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Per drinking session
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Yesterday Comparison + Fountain Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Yesterday Comparison */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Today vs Yesterday</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Water Consumed</span>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-sm text-muted-foreground">Yesterday</span>
                    <p className="font-semibold">{convert(yesterdayMl).toFixed(unit === "oz" ? 1 : 0)} {label}</p>
                  </div>
                  <div className="w-px h-8 bg-border" />
                  <div className="text-right">
                    <span className="text-sm text-primary">Today</span>
                    <p className="font-semibold text-primary">{convert(todayMl).toFixed(unit === "oz" ? 1 : 0)} {label}</p>
                  </div>
                </div>
              </div>
              <div className="h-px bg-border" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Sessions</span>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-sm text-muted-foreground">Yesterday</span>
                    <p className="font-semibold">{yesterdayCount}</p>
                  </div>
                  <div className="w-px h-8 bg-border" />
                  <div className="text-right">
                    <span className="text-sm text-primary">Today</span>
                    <p className="font-semibold text-primary">{todayCount}</p>
                  </div>
                </div>
              </div>
              <div className="h-px bg-border" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Hydration Goal</span>
                <div className="flex items-center gap-2">
                  <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${Math.min((todayMl / 200) * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium">{Math.min(Math.round((todayMl / 200) * 100), 100)}%</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Fountain Status */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              Fountain Status
              {status?.online ? (
                <Badge variant="outline" className="border-emerald-500/50 text-emerald-400 text-xs">
                  <Wifi className="h-3 w-3 mr-1" /> Online
                </Badge>
              ) : (
                <Badge variant="outline" className="border-red-500/50 text-red-400 text-xs">
                  <WifiOff className="h-3 w-3 mr-1" /> Offline
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Droplets className="h-4 w-4 text-primary" />
                  <span className="text-sm">Water Level</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${status?.weightPercent ?? 0}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold">{status?.weightPercent ?? 0}%</span>
                </div>
              </div>
              <div className="h-px bg-border" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-chart-2" />
                  <span className="text-sm">Filter Life</span>
                </div>
                <span className="text-sm font-semibold">{status?.remainingFilterDays ?? "—"} days</span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-chart-4" />
                  <span className="text-sm">Next Cleaning</span>
                </div>
                <span className="text-sm font-semibold">{status?.remainingCleaningDays ?? "—"} days</span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wifi className="h-4 w-4 text-chart-3" />
                  <span className="text-sm">Signal Strength</span>
                </div>
                <span className="text-sm font-semibold">{status?.wifiRssi ?? "—"} dBm</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Device Events Log */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Recent Fountain Events
          </CardTitle>
        </CardHeader>
        <CardContent>
          {eventsQuery.isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-10 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : eventsQuery.data?.fetchFailed ? (
            <div className="flex items-center gap-3 text-amber-400 py-4">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm">Failed to fetch events from the Petlibro API. Will retry automatically.</span>
            </div>
          ) : !eventsQuery.data?.events || eventsQuery.data.events.length === 0 ? (
            <div className="flex items-center gap-3 text-muted-foreground py-4">
              <Info className="h-4 w-4" />
              <span className="text-sm">No recent events recorded. Events will appear here once your fountain reports activity.</span>
            </div>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
              {eventsQuery.data.events.slice(0, 20).map((event: any, i: number) => (
                <div
                  key={event.eventId || i}
                  className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0"
                >
                  <div className="mt-0.5">
                    <div className="h-2 w-2 rounded-full bg-primary/60" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {event.eventName || event.content || event.eventType || "Event"}
                    </p>
                    {event.content && event.eventName && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {event.content}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {event.createTime
                      ? new Date(event.createTime).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
