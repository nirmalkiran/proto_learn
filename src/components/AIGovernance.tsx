import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Plus,
  Trash2,
  Eye,
  Copy,
  Settings,
  Cpu,
  HardDrive,
  Wifi,
  WifiOff,
  History,
  Download,
  MoreHorizontal,
  Ban,
  Play,
  RotateCcw,
  FileText,
  Users,
  Clock,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface AIGovernanceProps {
  projectId: string;
}

interface SafetyControl {
  id: string;
  control_type: string;
  enabled: boolean;
  config: any;
  created_at: string;
  updated_at?: string;
}

interface AuditLog {
  id: string;
  action: string;
  user_id: string;
  details: any;
  created_at: string;
  severity: string;
}

export const AIGovernance = ({ projectId }: AIGovernanceProps) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"controls" | "audit" | "policies">("controls");
  const [safetyControls, setSafetyControls] = useState<SafetyControl[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedControl, setSelectedControl] = useState<SafetyControl | null>(null);
  const [showControlDetails, setShowControlDetails] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [controlToDelete, setControlToDelete] = useState<SafetyControl | null>(null);

  // Create form states
  const [createControlType, setCreateControlType] = useState("");
  const [createControlConfig, setCreateControlConfig] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [projectId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      await Promise.all([loadSafetyControls(), loadAuditLogs()]);
    } catch (error) {
      console.error("Error loading AI governance data:", error);
      toast({
        title: "Error",
        description: "Failed to load AI governance data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadSafetyControls = async () => {
    // TODO: ai_safety_controls table does not exist yet - using empty array
    setSafetyControls([]);
  };

  const loadAuditLogs = async () => {
    // TODO: ai_audit_logs table does not exist yet - using empty array
    setAuditLogs([]);
  };

  const handleCreateControl = async () => {
    if (!createControlType.trim()) {
      toast({
        title: "Validation Error",
        description: "Please provide a control type",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);
    try {
      let config = {};
      try {
        config = JSON.parse(createControlConfig || "{}");
      } catch (e) {
        config = { description: createControlConfig };
      }

      // TODO: ai_safety_controls table does not exist - local only
      const newControl: SafetyControl = {
        id: crypto.randomUUID(),
        control_type: createControlType,
        enabled: true,
        config,
        created_at: new Date().toISOString(),
      };
      setSafetyControls(prev => [...prev, newControl]);

      toast({
        title: "Safety Control Created",
        description: `Control "${createControlType}" has been added`,
      });
      setShowCreateDialog(false);
      setCreateControlType("");
      setCreateControlConfig("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create safety control",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteControl = async (control: SafetyControl) => {
    try {
      // TODO: ai_safety_controls table does not exist - local only
      setSafetyControls(prev => prev.filter(c => c.id !== control.id));

      toast({
        title: "Safety Control Deleted",
        description: `Control "${control.control_type}" has been removed`,
      });
      setControlToDelete(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete safety control",
        variant: "destructive",
      });
    }
  };

  const handleToggleControl = async (control: SafetyControl) => {
    try {
      // TODO: ai_safety_controls table does not exist - local only
      setSafetyControls(prev =>
        prev.map(c => c.id === control.id ? { ...c, enabled: !c.enabled } : c)
      );

      toast({
        title: "Control Updated",
        description: `Control "${control.control_type}" ${!control.enabled ? "enabled" : "disabled"}`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update control",
        variant: "destructive",
      });
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "high":
        return (
          <Badge className="bg-red-500/20 text-red-500 border-red-500/50">
            <XCircle className="h-3 w-3 mr-1" />
            High
          </Badge>
        );
      case "medium":
        return (
          <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/50">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Medium
          </Badge>
        );
      case "low":
        return (
          <Badge className="bg-blue-500/20 text-blue-500 border-blue-500/50">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Low
          </Badge>
        );
      default:
        return <Badge variant="outline">{severity}</Badge>;
    }
  };

  const formatConfig = (config: any) => {
    if (!config) return "No configuration";
    if (typeof config === "object") {
      return JSON.stringify(config, null, 2);
    }
    return String(config);
  };

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Shield className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Controls</p>
                <p className="text-2xl font-bold text-green-500">
                  {safetyControls.filter((c) => c.enabled).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">High Severity Events</p>
                <p className="text-2xl font-bold text-yellow-500">
                  {auditLogs.filter((l) => l.severity === "high").length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <History className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Audit Events</p>
                <p className="text-2xl font-bold text-blue-500">{auditLogs.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                AI Governance
              </CardTitle>
              <CardDescription>Manage AI safety controls and monitor usage</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button size="sm" onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Control
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <TabsList className="mb-4">
              <TabsTrigger value="controls" className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Safety Controls ({safetyControls.length})
              </TabsTrigger>
              <TabsTrigger value="audit" className="flex items-center gap-2">
                <History className="h-4 w-4" />
                Audit Logs ({auditLogs.length})
              </TabsTrigger>
              <TabsTrigger value="policies" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Policies
              </TabsTrigger>
            </TabsList>

            {/* Safety Controls Tab */}
            <TabsContent value="controls">
              {safetyControls.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-medium mb-2">No Safety Controls</h3>
                  <p className="mb-4">Add safety controls to govern AI usage.</p>
                  <Button onClick={() => setShowCreateDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Control
                  </Button>
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Control Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Configuration</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {safetyControls.map((control) => (
                        <TableRow key={control.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{control.control_type}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={control.enabled ? "default" : "secondary"}>
                              {control.enabled ? "Enabled" : "Disabled"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="max-w-xs truncate text-sm text-muted-foreground">
                              {formatConfig(control.config)}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDistanceToNow(new Date(control.created_at), { addSuffix: true })}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedControl(control);
                                  setShowControlDetails(true);
                                }}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleToggleControl(control)}
                              >
                                {control.enabled ? (
                                  <Ban className="h-4 w-4 text-destructive" />
                                ) : (
                                  <Play className="h-4 w-4 text-green-500" />
                                )}
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setControlToDelete(control)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </TabsContent>

            {/* Audit Logs Tab */}
            <TabsContent value="audit">
              <ScrollArea className="h-[400px]">
                {auditLogs.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <h3 className="text-lg font-medium mb-2">No Audit Events</h3>
                    <p>Audit events will appear here when AI actions are logged.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Severity</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Details</TableHead>
                        <TableHead>Timestamp</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell>{getSeverityBadge(log.severity)}</TableCell>
                          <TableCell className="font-mono text-sm">{log.action}</TableCell>
                          <TableCell className="font-mono text-xs">{log.user_id.slice(0, 8)}</TableCell>
                          <TableCell>
                            <div className="max-w-xs truncate text-sm text-muted-foreground">
                              {log.details ? JSON.stringify(log.details) : "No details"}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </ScrollArea>
            </TabsContent>

            {/* Policies Tab */}
            <TabsContent value="policies">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Governance Policies</CardTitle>
                    <CardDescription>Define rules and policies for AI usage</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div>
                          <Label className="text-sm font-medium">Maximum Tokens per Request</Label>
                          <p className="text-sm text-muted-foreground">1000 tokens</p>
                        </div>
                        <div>
                          <Label className="text-sm font-medium">Allowed Content Types</Label>
                          <p className="text-sm text-muted-foreground">Test cases, documentation, code</p>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <Label className="text-sm font-medium">Blocked Keywords</Label>
                          <p className="text-sm text-muted-foreground">Sensitive data, personal info</p>
                        </div>
                        <div>
                          <Label className="text-sm font-medium">Audit Retention</Label>
                          <p className="text-sm text-muted-foreground">90 days</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Compliance Settings</CardTitle>
                    <CardDescription>Configure compliance and regulatory requirements</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium">Data Privacy Compliance</Label>
                          <p className="text-sm text-muted-foreground">GDPR, CCPA compliance enabled</p>
                        </div>
                        <Badge variant="secondary">Enabled</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium">Content Moderation</Label>
                          <p className="text-sm text-muted-foreground">Automatic content filtering</p>
                        </div>
                        <Badge variant="secondary">Enabled</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium">Usage Analytics</Label>
                          <p className="text-sm text-muted-foreground">Track AI usage patterns</p>
                        </div>
                        <Badge variant="secondary">Enabled</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Create Control Dialog */}
      <Dialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateDialog(false);
            setCreateControlType("");
            setCreateControlConfig("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Safety Control</DialogTitle>
            <DialogDescription>Add a new AI safety control for this project</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="controlType">Control Type</Label>
              <Input
                id="controlType"
                placeholder="e.g., content_filter, rate_limit"
                value={createControlType}
                onChange={(e) => setCreateControlType(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="controlConfig">Configuration (JSON)</Label>
              <Textarea
                id="controlConfig"
                placeholder='{"max_tokens": 1000, "blocked_keywords": ["sensitive"]}'
                value={createControlConfig}
                onChange={(e) => setCreateControlConfig(e.target.value)}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Enter configuration as JSON or plain text description
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateControl} disabled={isCreating}>
              {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Control
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Control Details Dialog */}
      <Dialog open={showControlDetails} onOpenChange={setShowControlDetails}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Safety Control Details</DialogTitle>
          </DialogHeader>
          {selectedControl && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Type</Label>
                  <p className="font-medium">{selectedControl.control_type}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <Badge variant={selectedControl.enabled ? "default" : "secondary"} className="mt-1">
                    {selectedControl.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                <div>
                  <Label className="text-muted-foreground">Created</Label>
                  <p className="text-sm">
                    {formatDistanceToNow(new Date(selectedControl.created_at), { addSuffix: true })}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Updated</Label>
                  <p className="text-sm">
                    {formatDistanceToNow(new Date(selectedControl.updated_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">Configuration</Label>
                <pre className="mt-1 p-3 bg-muted rounded-lg text-xs overflow-auto max-h-40">
                  {formatConfig(selectedControl.config)}
                </pre>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowControlDetails(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!controlToDelete} onOpenChange={() => setControlToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Safety Control</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete control "{controlToDelete?.control_type}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => controlToDelete && handleDeleteControl(controlToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
