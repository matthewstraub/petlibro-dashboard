import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { AlertTriangle, Download, FileJson, Loader2, Droplets, Clock, GlassWater, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useUnit } from "@/contexts/UnitContext";
import { DatePicker } from "@/components/ui/date-picker";
import { format } from "date-fns";

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatMonth(monthStr: string) {
  const [year, month] = monthStr.split("-");
  const d = new Date(parseInt(year), parseInt(month) - 1);
  const monthName = d.toLocaleDateString("en-US", { month: "short" });
  const shortYear = year.slice(-2);
  return `${monthName} '${shortYear}`;
}

function CustomTooltipInner({ active, payload, label, unitLabel, unit }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-xl">
        <p className="text-xs text-muted-foreground">{label}</p>
        {payload.map((entry: any, i: number) => (
          <p key={i} className="text-sm font-semibold" style={{ color: entry.color }}>
            {entry.name === "avgMl" || entry.name === "totalMl"
              ? `${unit === "oz" ? entry.value.toFixed(2) : Math.round(entry.value)} ${unitLabel}`
              : entry.value?.toFixed(1)}
          </p>
        ))}
      </div>
    );
  }
  return null;
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function convertToCSV(data: any[], columns: { key: string; label: string }[]): string {
  const header = columns.map((c) => c.label).join(",");
  const rows = data.map((row) =>
    columns.map((c) => {
      const val = row[c.key];
      if (val === null || val === undefined) return "";
      if (typeof val === "string" && val.includes(",")) return `"${val}"`;
      return val;
    }).join(",")
  );
  return [header, ...rows].join("\n");
}

function DailyDetailView() {
  const { convert, format: formatValue, label: unitLabel, unit } = useUnit();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const dateStr = useMemo(() => format(selectedDate, "yyyy-MM-dd"), [selectedDate]);

  const { data, isLoading } = trpc.history.dailyDetail.useQuery({ date: dateStr });
  const { data: sessions, isLoading: sessionsLoading } = trpc.history.drinkingSessions.useQuery({ date: dateStr });

  const goToPrevDay = () => {
    setSelectedDate((d) => new Date(d.getTime() - 86400000));
  };

  const goToNextDay = () => {
    const tomorrow = new Date(selectedDate.getTime() + 86400000);
    if (tomorrow <= new Date()) {
      setSelectedDate(tomorrow);
    }
  };

  const isToday = format(selectedDate, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");

  // Build hourly chart data from drinking sessions (preferred) or fall back to hourly_water_log
  const hourlyChartData = useMemo(() => {
    // If we have session data, compute hourly breakdown from it for consistency with the timeline
    if (sessions && sessions.length > 0) {
      const hourlyMap = new Map<number, { totalMl: number; count: number }>();
      for (const s of sessions) {
        const hour = new Date(Number(s.sessionTime)).getHours();
        const existing = hourlyMap.get(hour) || { totalMl: 0, count: 0 };
        existing.totalMl += s.amountMl || 0;
        existing.count += 1;
        hourlyMap.set(hour, existing);
      }
      return Array.from({ length: 24 }, (_, i) => ({
        hour: `${i.toString().padStart(2, "0")}:00`,
        totalMl: convert(hourlyMap.get(i)?.totalMl || 0),
        sessions: hourlyMap.get(i)?.count || 0,
      }));
    }
    // Fallback: use hourly_water_log data from the server
    const hourlyMap = new Map<number, { totalMl: number; drinkingCount: number }>();
    (data?.hourly || []).forEach((h: any) => {
      hourlyMap.set(h.hour, { totalMl: h.totalMl, drinkingCount: h.drinkingCount });
    });
    return Array.from({ length: 24 }, (_, i) => ({
      hour: `${i.toString().padStart(2, "0")}:00`,
      totalMl: convert(hourlyMap.get(i)?.totalMl || 0),
      sessions: hourlyMap.get(i)?.drinkingCount || 0,
    }));
  }, [sessions, data?.hourly, convert]);

  const summary = data?.summary;

  return (
    <div className="space-y-4">
      {/* Date navigation */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon-sm" onClick={goToPrevDay}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <DatePicker
          date={selectedDate}
          onSelect={(d) => d && setSelectedDate(d)}
          disabled={(d) => d > new Date()}
        />
        <Button variant="outline" size="icon-sm" onClick={goToNextDay} disabled={isToday}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        {isToday && (
          <span className="text-xs text-muted-foreground bg-primary/10 px-2 py-1 rounded-md">Today</span>
        )}
      </div>

      {isLoading ? (
        <Card className="glass-card">
          <CardContent className="pt-6 flex items-center justify-center h-[200px]">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </CardContent>
        </Card>
      ) : !summary ? (
        <Card className="glass-card border-amber-500/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              <div>
                <p className="font-medium">No data for this day</p>
                <p className="text-sm text-muted-foreground mt-1">
                  No drinking data was recorded on {format(selectedDate, "MMMM d, yyyy")}.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Daily summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="glass-card">
              <CardContent className="pt-4 pb-4 px-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Droplets className="h-3.5 w-3.5" />
                  <span className="text-xs">Total Intake</span>
                </div>
                <p className="text-xl font-bold">
                  {formatValue(summary.totalMl)}
                  <span className="text-xs font-normal text-muted-foreground ml-1">{unitLabel}</span>
                </p>
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardContent className="pt-4 pb-4 px-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <GlassWater className="h-3.5 w-3.5" />
                  <span className="text-xs">Sessions</span>
                </div>
                <p className="text-xl font-bold">
                  {summary.drinkingCount}
                  <span className="text-xs font-normal text-muted-foreground ml-1">times</span>
                </p>
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardContent className="pt-4 pb-4 px-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Clock className="h-3.5 w-3.5" />
                  <span className="text-xs">Total Time</span>
                </div>
                <p className="text-xl font-bold">
                  {summary.totalDrinkingTime}
                  <span className="text-xs font-normal text-muted-foreground ml-1">sec</span>
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {Math.floor(summary.totalDrinkingTime / 60)}m {summary.totalDrinkingTime % 60}s
                </p>
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardContent className="pt-4 pb-4 px-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Clock className="h-3.5 w-3.5" />
                  <span className="text-xs">Avg Duration</span>
                </div>
                <p className="text-xl font-bold">
                  {summary.avgDrinkDuration}
                  <span className="text-xs font-normal text-muted-foreground ml-1">sec</span>
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {Math.floor(summary.avgDrinkDuration / 60)}m {summary.avgDrinkDuration % 60}s
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Hourly breakdown chart */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base">
                Hourly Breakdown — {format(selectedDate, "MMMM d, yyyy")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlyChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.01 250)" />
                    <XAxis dataKey="hour" stroke="oklch(0.6 0.02 220)" fontSize={11} interval={2} label={{ value: "Hour of Day", position: "insideBottom", offset: -2, style: { fill: "oklch(0.6 0.02 220)", fontSize: 11 } }} />
                    <YAxis stroke="oklch(0.6 0.02 220)" fontSize={12} label={{ value: unitLabel, angle: -90, position: "insideLeft", style: { fill: "oklch(0.6 0.02 220)", fontSize: 11 } }} />
                    <Tooltip content={<CustomTooltipInner unitLabel={unitLabel} unit={unit} />} />
                    <Bar dataKey="totalMl" fill="oklch(0.65 0.15 195)" radius={[3, 3, 0, 0]} name="totalMl" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {(!sessions || sessions.length === 0) && (!data?.hourly || data.hourly.length === 0) && (
                <p className="text-center text-sm text-muted-foreground mt-2">
                  No hourly data available for this day.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Drinking Sessions Timeline */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base">
                Drinking Sessions — {format(selectedDate, "MMMM d, yyyy")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sessionsLoading ? (
                <div className="flex items-center justify-center h-[100px]">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : !sessions || sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No individual session data available for this day. Sessions are synced automatically — data will appear after the next sync.
                </p>
              ) : (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-[68px] top-2 bottom-2 w-px bg-border" />
                  <div className="space-y-0">
                    {sessions.map((session: any, idx: number) => {
                      const time = new Date(Number(session.sessionTime));
                      const timeStr = time.toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      });
                      const durSec = session.durationSec || 0;
                      const durStr = durSec >= 60
                        ? `${Math.floor(durSec / 60).toString().padStart(2, "0")}m${(durSec % 60).toString().padStart(2, "0")}s`
                        : `${durSec.toString().padStart(2, "0")}s`;
                      return (
                        <div key={session.sessionId || idx} className="flex items-start gap-3 py-2.5 group">
                          <span className="text-xs text-muted-foreground w-[60px] text-right pt-0.5 shrink-0 font-mono">
                            {timeStr}
                          </span>
                          <div className="relative z-10 mt-1">
                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm">
                              Your pet(s) drank <span className="font-semibold text-primary">{formatValue(session.amountMl)} {unitLabel}</span> water in <span className="font-medium">{durStr}</span>.
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default function Trends() {
  const { convert, format: formatValue, label: unitLabel, unit, toggleUnit } = useUnit();
  const weekly = trpc.history.weekly.useQuery();
  const monthly = trpc.history.monthly.useQuery({ months: 2 });
  const yearly = trpc.history.yearly.useQuery();
  const hourly = trpc.history.hourly.useQuery();
  const exportAll = trpc.history.exportAll.useQuery(undefined, { enabled: false });

  const [exporting, setExporting] = useState(false);

  const weeklyData = (weekly.data || []).map((d: any) => ({
    date: formatDate(d.date),
    totalMl: convert(d.totalMl),
    drinkingCount: d.drinkingCount,
  }));

  const monthlyData = (monthly.data || []).map((d: any) => ({
    date: formatDate(d.date),
    totalMl: convert(d.totalMl),
    drinkingCount: d.drinkingCount,
  }));

  const yearlyData = (yearly.data || []).map((d: any) => ({
    month: formatMonth(d.month),
    avgMl: convert(parseFloat(d.avgMl) || 0),
    totalMl: convert(parseFloat(d.totalMl) || 0),
    daysRecorded: parseInt(d.daysRecorded) || 0,
  }));

  // Build hourly data (0-23 hours)
  const hourlyMap = new Map<number, { avgMl: number; avgCount: number }>();
  (hourly.data || []).forEach((d: any) => {
    hourlyMap.set(d.hour, {
      avgMl: parseFloat(d.avgMl) || 0,
      avgCount: parseFloat(d.avgCount) || 0,
    });
  });
  const hourlyData = Array.from({ length: 24 }, (_, i) => ({
    hour: `${i.toString().padStart(2, "0")}:00`,
    avgMl: convert(hourlyMap.get(i)?.avgMl || 0),
    avgCount: hourlyMap.get(i)?.avgCount || 0,
  }));

  const isLoading = weekly.isLoading || monthly.isLoading || yearly.isLoading || hourly.isLoading;
  const noData = weeklyData.length === 0 && monthlyData.length === 0 && yearlyData.length === 0;

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const result = await exportAll.refetch();
      if (!result.data) {
        toast.error("No data to export");
        return;
      }

      const { dailyLogs } = result.data;
      const columns = [
        { key: "date", label: "Date" },
        { key: "totalMl", label: "Total mL" },
        { key: "drinkingCount", label: "Drinking Sessions" },
        { key: "totalDrinkingTime", label: "Total Drinking Time (s)" },
        { key: "avgDrinkDuration", label: "Avg Session Duration (s)" },
      ];

      const csvData = dailyLogs.map((d: any) => ({
        date: typeof d.date === "string" ? d.date.split("T")[0] : new Date(d.date).toISOString().split("T")[0],
        totalMl: d.totalMl,
        drinkingCount: d.drinkingCount,
        totalDrinkingTime: d.totalDrinkingTime,
        avgDrinkDuration: d.avgDrinkDuration,
      }));

      const csv = convertToCSV(csvData, columns);
      const dateStr = new Date().toISOString().split("T")[0];
      downloadFile(csv, `petlibro-water-data-${dateStr}.csv`, "text/csv");
      toast.success("CSV exported successfully");
    } catch (error) {
      toast.error("Failed to export data");
    } finally {
      setExporting(false);
    }
  };

  const handleExportJSON = async () => {
    setExporting(true);
    try {
      const result = await exportAll.refetch();
      if (!result.data) {
        toast.error("No data to export");
        return;
      }

      const exportData = {
        exportedAt: new Date().toISOString(),
        dailyLogs: result.data.dailyLogs.map((d: any) => ({
          date: typeof d.date === "string" ? d.date.split("T")[0] : new Date(d.date).toISOString().split("T")[0],
          totalMl: d.totalMl,
          drinkingCount: d.drinkingCount,
          totalDrinkingTime: d.totalDrinkingTime,
          avgDrinkDuration: d.avgDrinkDuration,
        })),
        hourlyAverages: result.data.hourlyLogs,
        monthlyAverages: result.data.monthlyLogs,
      };

      const json = JSON.stringify(exportData, null, 2);
      const dateStr = new Date().toISOString().split("T")[0];
      downloadFile(json, `petlibro-water-data-${dateStr}.json`, "application/json");
      toast.success("JSON exported successfully");
    } catch (error) {
      toast.error("Failed to export data");
    } finally {
      setExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trends</h1>
          <p className="text-muted-foreground mt-1">Historical water consumption analysis</p>
        </div>
        <Card className="glass-card">
          <CardContent className="pt-6 flex items-center justify-center h-[320px]">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (noData) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trends</h1>
          <p className="text-muted-foreground mt-1">Historical water consumption analysis</p>
        </div>
        <Card className="glass-card border-amber-500/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              <div>
                <p className="font-medium">No historical data yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Data will appear here once your fountain starts syncing. Visit the Dashboard to trigger a sync.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trends</h1>
          <p className="text-muted-foreground mt-1">Historical water consumption analysis</p>
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
            onClick={handleExportCSV}
            disabled={exporting}
            className="gap-2"
          >
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportJSON}
            disabled={exporting}
            className="gap-2"
          >
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileJson className="h-3.5 w-3.5" />}
            Export JSON
          </Button>
        </div>
      </div>

      <Tabs defaultValue="daily" className="space-y-4">
        <TabsList className="bg-secondary">
          <TabsTrigger value="daily">Daily</TabsTrigger>
          <TabsTrigger value="weekly">Weekly</TabsTrigger>
          <TabsTrigger value="monthly">Monthly</TabsTrigger>
          <TabsTrigger value="yearly">Yearly</TabsTrigger>
          <TabsTrigger value="hourly">Time of Day</TabsTrigger>
        </TabsList>

        {/* Daily Detail */}
        <TabsContent value="daily">
          <DailyDetailView />
        </TabsContent>

        {/* Weekly Chart */}
        <TabsContent value="weekly">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base">Past 7 Days — Daily Water Intake</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.01 250)" />
                    <XAxis dataKey="date" stroke="oklch(0.6 0.02 220)" fontSize={12} label={{ value: "Day", position: "insideBottom", offset: -2, style: { fill: "oklch(0.6 0.02 220)", fontSize: 11 } }} />
                    <YAxis stroke="oklch(0.6 0.02 220)" fontSize={12} label={{ value: unitLabel, angle: -90, position: "insideLeft", style: { fill: "oklch(0.6 0.02 220)", fontSize: 11 } }} />
                    <Tooltip content={<CustomTooltipInner unitLabel={unitLabel} unit={unit} />} />
                    <Bar dataKey="totalMl" fill="oklch(0.65 0.15 195)" radius={[4, 4, 0, 0]} name="totalMl" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Monthly Chart */}
        <TabsContent value="monthly">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base">Past 2 Months — Daily Water Intake</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorMl" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="oklch(0.65 0.15 195)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="oklch(0.65 0.15 195)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.01 250)" />
                    <XAxis dataKey="date" stroke="oklch(0.6 0.02 220)" fontSize={12} label={{ value: "Day", position: "insideBottom", offset: -2, style: { fill: "oklch(0.6 0.02 220)", fontSize: 11 } }} />
                    <YAxis stroke="oklch(0.6 0.02 220)" fontSize={12} label={{ value: unitLabel, angle: -90, position: "insideLeft", style: { fill: "oklch(0.6 0.02 220)", fontSize: 11 } }} />
                    <Tooltip content={<CustomTooltipInner unitLabel={unitLabel} unit={unit} />} />
                    <Area
                      type="monotone"
                      dataKey="totalMl"
                      stroke="oklch(0.65 0.15 195)"
                      fillOpacity={1}
                      fill="url(#colorMl)"
                      name="totalMl"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Yearly Chart */}
        <TabsContent value="yearly">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base">Past 12 Months — Average Daily Intake per Month</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={yearlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.01 250)" />
                    <XAxis dataKey="month" stroke="oklch(0.6 0.02 220)" fontSize={12} label={{ value: "Month", position: "insideBottom", offset: -2, style: { fill: "oklch(0.6 0.02 220)", fontSize: 11 } }} />
                    <YAxis stroke="oklch(0.6 0.02 220)" fontSize={12} label={{ value: unitLabel, angle: -90, position: "insideLeft", style: { fill: "oklch(0.6 0.02 220)", fontSize: 11 } }} />
                    <Tooltip content={<CustomTooltipInner unitLabel={unitLabel} unit={unit} />} />
                    <Bar dataKey="avgMl" fill="oklch(0.6 0.12 210)" radius={[4, 4, 0, 0]} name="avgMl" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Hourly / Time of Day */}
        <TabsContent value="hourly">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base">Average Drinking Activity by Hour (Past 30 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.01 250)" />
                    <XAxis dataKey="hour" stroke="oklch(0.6 0.02 220)" fontSize={11} interval={2} label={{ value: "Hour of Day", position: "insideBottom", offset: -2, style: { fill: "oklch(0.6 0.02 220)", fontSize: 11 } }} />
                    <YAxis stroke="oklch(0.6 0.02 220)" fontSize={12} label={{ value: unitLabel, angle: -90, position: "insideLeft", style: { fill: "oklch(0.6 0.02 220)", fontSize: 11 } }} />
                    <Tooltip content={<CustomTooltipInner unitLabel={unitLabel} unit={unit} />} />
                    <Bar dataKey="avgMl" fill="oklch(0.75 0.1 175)" radius={[3, 3, 0, 0]} name="avgMl" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
