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
import { AlertTriangle, Download, FileJson, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatMonth(monthStr: string) {
  const [year, month] = monthStr.split("-");
  const d = new Date(parseInt(year), parseInt(month) - 1);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-xl">
        <p className="text-xs text-muted-foreground">{label}</p>
        {payload.map((entry: any, i: number) => (
          <p key={i} className="text-sm font-semibold" style={{ color: entry.color }}>
            {entry.value?.toFixed(0)} {entry.name === "avgMl" || entry.name === "totalMl" ? "mL" : ""}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

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

export default function Trends() {
  const weekly = trpc.history.weekly.useQuery();
  const monthly = trpc.history.monthly.useQuery({ months: 2 });
  const yearly = trpc.history.yearly.useQuery();
  const hourly = trpc.history.hourly.useQuery();
  const exportAll = trpc.history.exportAll.useQuery(undefined, { enabled: false });

  const [exporting, setExporting] = useState(false);

  const weeklyData = (weekly.data || []).map((d: any) => ({
    date: formatDate(d.date),
    totalMl: d.totalMl,
    drinkingCount: d.drinkingCount,
  }));

  const monthlyData = (monthly.data || []).map((d: any) => ({
    date: formatDate(d.date),
    totalMl: d.totalMl,
    drinkingCount: d.drinkingCount,
  }));

  const yearlyData = (yearly.data || []).map((d: any) => ({
    month: formatMonth(d.month),
    avgMl: parseFloat(d.avgMl) || 0,
    totalMl: parseFloat(d.totalMl) || 0,
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
    avgMl: hourlyMap.get(i)?.avgMl || 0,
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

      <Tabs defaultValue="weekly" className="space-y-4">
        <TabsList className="bg-secondary">
          <TabsTrigger value="weekly">Weekly</TabsTrigger>
          <TabsTrigger value="monthly">Monthly</TabsTrigger>
          <TabsTrigger value="yearly">Yearly</TabsTrigger>
          <TabsTrigger value="hourly">Time of Day</TabsTrigger>
        </TabsList>

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
                    <XAxis dataKey="date" stroke="oklch(0.6 0.02 220)" fontSize={12} />
                    <YAxis stroke="oklch(0.6 0.02 220)" fontSize={12} />
                    <Tooltip content={<CustomTooltip />} />
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
                    <XAxis dataKey="date" stroke="oklch(0.6 0.02 220)" fontSize={12} />
                    <YAxis stroke="oklch(0.6 0.02 220)" fontSize={12} />
                    <Tooltip content={<CustomTooltip />} />
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
              <CardTitle className="text-base">Past 12 Months — Monthly Average Intake</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={yearlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.01 250)" />
                    <XAxis dataKey="month" stroke="oklch(0.6 0.02 220)" fontSize={12} />
                    <YAxis stroke="oklch(0.6 0.02 220)" fontSize={12} />
                    <Tooltip content={<CustomTooltip />} />
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
                    <XAxis dataKey="hour" stroke="oklch(0.6 0.02 220)" fontSize={11} interval={2} />
                    <YAxis stroke="oklch(0.6 0.02 220)" fontSize={12} />
                    <Tooltip content={<CustomTooltip />} />
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
