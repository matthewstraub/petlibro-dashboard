import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle, Loader2, Key, Server, Wifi } from "lucide-react";

export default function Settings() {
  const credentials = trpc.credentials.get.useQuery();
  const saveMutation = trpc.credentials.save.useMutation({
    onSuccess: () => {
      toast.success("Credentials saved successfully");
      credentials.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const testMutation = trpc.credentials.test.useMutation();
  const selectDeviceMutation = trpc.credentials.selectDevice.useMutation({
    onSuccess: () => {
      toast.success("Device selected");
      credentials.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [region, setRegion] = useState("US");
  const [testResult, setTestResult] = useState<{
    success: boolean;
    devices: any[];
    error?: string;
  } | null>(null);

  const handleTest = async () => {
    if (!email || !password) {
      toast.error("Please enter email and password");
      return;
    }
    setTestResult(null);
    const result = await testMutation.mutateAsync({ email, password, region });
    setTestResult(result);
    if (result.success) {
      toast.success(`Connected! Found ${result.devices.length} device(s)`);
    } else {
      toast.error(result.error || "Connection failed");
    }
  };

  const handleSave = async () => {
    if (!email || !password) {
      toast.error("Please enter email and password");
      return;
    }
    await saveMutation.mutateAsync({ email, password, region });
  };

  const handleSelectDevice = async (deviceSn: string) => {
    await selectDeviceMutation.mutateAsync({ deviceSn });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Configure your Petlibro account connection</p>
      </div>

      {/* Current Status */}
      {credentials.data && (
        <Card className="glass-card border-emerald-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-emerald-400" />
              <div className="flex-1">
                <p className="font-medium text-emerald-300">Connected</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Account: {credentials.data.email} ({credentials.data.region})
                  {credentials.data.deviceSn && (
                    <span className="ml-2">
                      — Device: <code className="text-xs bg-muted px-1 py-0.5 rounded">{credentials.data.deviceSn}</code>
                    </span>
                  )}
                </p>
                {credentials.data.lastSyncAt && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Last synced: {new Date(credentials.data.lastSyncAt).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Credentials Form */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Key className="h-4 w-4 text-primary" />
            Petlibro Account
          </CardTitle>
          <CardDescription>
            Enter your Petlibro app credentials. These are the same email and password you use to log into the Petlibro mobile app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-input/50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Your Petlibro password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-input/50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="region">Region</Label>
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger className="bg-input/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="US">United States</SelectItem>
                <SelectItem value="EU">Europe</SelectItem>
                <SelectItem value="AP">Asia Pacific</SelectItem>
                <SelectItem value="CN">China</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={testMutation.isPending}
              className="gap-2"
            >
              {testMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wifi className="h-4 w-4" />
              )}
              Test Connection
            </Button>
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="gap-2"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Server className="h-4 w-4" />
              )}
              Save Credentials
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Device Selection */}
      {testResult?.success && testResult.devices.length > 0 && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base">Select Your Fountain</CardTitle>
            <CardDescription>
              Found {testResult.devices.length} device(s) on your account. Select the fountain to track.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {testResult.devices.map((device: any) => (
                <div
                  key={device.deviceSn}
                  className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/50 transition-colors"
                >
                  <div>
                    <p className="font-medium">{device.name || device.productName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {device.productName} — SN: {device.deviceSn}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleSelectDevice(device.deviceSn)}
                    disabled={selectDeviceMutation.isPending}
                  >
                    Select
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Test Error */}
      {testResult && !testResult.success && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="pt-6">
            <p className="text-sm text-red-400">{testResult.error}</p>
          </CardContent>
        </Card>
      )}

      {/* Info */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base">About</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            This dashboard connects to the Petlibro cloud API to fetch real-time water consumption data from your Dockstream Smart Fountain (PLWF105).
          </p>
          <p>
            Data is synced automatically when you visit the dashboard and stored locally for historical trend analysis. Your credentials are stored securely and only used to authenticate with Petlibro's servers.
          </p>
          <p className="text-xs mt-4">
            Based on the{" "}
            <a href="https://github.com/jjjonesjr33/petlibro" target="_blank" rel="noopener" className="text-primary hover:underline">
              jjjonesjr33/petlibro
            </a>{" "}
            Home Assistant integration.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
