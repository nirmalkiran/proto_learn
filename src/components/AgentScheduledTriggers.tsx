import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Clock,
  Plus,
  Trash2,
  Edit,
  Play,
  Pause,
  Calendar,
  Rocket,
  Copy,
  RefreshCw,
  Loader2,
  History,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

interface AgentScheduledTriggersProps {
  projectId: string;
}

interface ScheduledTrigger {
  id: string;
  name: string;
  description: string | null;
  trigger_type: "schedule" | "deployment";
  schedule_type: string | null;
  schedule_time: string | null;
  schedule_day_of_week: number | null;
  schedule_timezone: string;
  deployment_environment: string | null;
  deployment_webhook_secret: string | null;
  target_type: "test" | "suite";
  target_id: string;
  agent_id: string | null;
  is_active: boolean;
  last_triggered_at: string | null;
  next_scheduled_at: string | null;
  created_at: string;
}

interface TriggerExecution {
  id: string;
  trigger_id: string;
  triggered_at: string;
  trigger_source: string;
  deployment_info: any;
  job_id: string | null;
  status: string;
  error_message: string | null;
}

interface NoCodeTest {
  id: string;
  name: string;
}

interface TestSuite {
  id: string;
  name: string;
}

interface Agent {
  id: string;
  agent_name: string;
  status: string;
  last_heartbeat: string | null;
}

const DAYS_OF_WEEK = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Australia/Sydney",
];

export const AgentScheduledTriggers = ({ projectId }: AgentScheduledTriggersProps) => {
  const { toast } = useToast();
  const [triggers, setTriggers] = useState<ScheduledTrigger[]>([]);
  const [executions, setExecutions] = useState<TriggerExecution[]>([]);
  const [tests, setTests] = useState<NoCodeTest[]>([]);
  const [suites, setSuites] = useState<TestSuite[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [selectedTrigger, setSelectedTrigger] = useState<ScheduledTrigger | null>(null);
  const [triggerToDelete, setTriggerToDelete] = useState<ScheduledTrigger | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    trigger_type: "schedule" as "schedule" | "deployment",
    schedule_type: "daily",
    schedule_time: "09:00",
    schedule_day_of_week: 1,
    schedule_timezone: "UTC",
    deployment_environment: "QA",
    target_type: "test" as "test" | "suite",
    target_id: "",
    agent_id: "any",
    is_active: true,
  });

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      await Promise.all([loadTriggers(), loadTests(), loadSuites(), loadAgents()]);
    } catch (error) {
      console.error("Error loading data:", error);
      toast({
        title: "Error",
        description: "Failed to load scheduled triggers",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadTriggers = async () => {
    const { data, error } = await supabase
      .from("agent_scheduled_triggers")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    setTriggers((data || []) as ScheduledTrigger[]);
  };

  const loadTests = async () => {
    const { data, error } = await supabase
      .from("nocode_tests")
      .select("id, name")
      .eq("project_id", projectId)
      .order("name");

    if (error) throw error;
    setTests(data || []);
  };

  const loadSuites = async () => {
    const { data, error } = await supabase
      .from("nocode_test_suites")
      .select("id, name")
      .eq("project_id", projectId)
      .order("name");

    if (error) throw error;
    setSuites(data || []);
  };

  const loadAgents = async () => {
    const { data, error } = await supabase
      .from("self_hosted_agents")
      .select("id, agent_name, status, last_heartbeat")
      .eq("project_id", projectId)
      .order("agent_name");

    if (error) throw error;
    setAgents(data || []);
  };

  const loadExecutions = async (triggerId: string) => {
    const { data, error } = await supabase
      .from("agent_trigger_executions")
      .select("*")
      .eq("trigger_id", triggerId)
      .order("triggered_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    setExecutions((data || []) as TriggerExecution[]);
  };

  const calculateNextScheduledTime = (
    scheduleType: string,
    scheduleTime: string,
    scheduleDayOfWeek: number,
  ): string => {
    const now = new Date();
    const [hours, minutes] = scheduleTime.split(":").map(Number);

    const next = new Date();
    next.setHours(hours, minutes, 0, 0);

    if (scheduleType === "hourly") {
      next.setMinutes(minutes);
      if (next <= now) {
        next.setHours(next.getHours() + 1);
      }
    } else if (scheduleType === "daily") {
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
    } else if (scheduleType === "weekly") {
      const currentDay = now.getDay();
      let daysUntilNext = scheduleDayOfWeek - currentDay;
      if (daysUntilNext < 0 || (daysUntilNext === 0 && next <= now)) {
        daysUntilNext += 7;
      }
      next.setDate(next.getDate() + daysUntilNext);
    }

    return next.toISOString();
  };

  const handleCreateTrigger = async () => {
    if (!formData.name.trim() || !formData.target_id) {
      toast({
        title: "Validation Error",
        description: "Please provide a name and select a target",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const webhookSecret = formData.trigger_type === "deployment" ? crypto.randomUUID() : null;

      const nextScheduled =
        formData.trigger_type === "schedule"
          ? calculateNextScheduledTime(formData.schedule_type, formData.schedule_time, formData.schedule_day_of_week)
          : null;

      const { error } = await supabase.from("agent_scheduled_triggers").insert({
        project_id: projectId,
        name: formData.name,
        description: formData.description || null,
        trigger_type: formData.trigger_type,
        schedule_type: formData.trigger_type === "schedule" ? formData.schedule_type : null,
        schedule_time: formData.trigger_type === "schedule" ? formData.schedule_time : null,
        schedule_day_of_week:
          formData.trigger_type === "schedule" && formData.schedule_type === "weekly"
            ? formData.schedule_day_of_week
            : null,
        schedule_timezone: formData.schedule_timezone,
        deployment_environment: formData.trigger_type === "deployment" ? formData.deployment_environment : null,
        deployment_webhook_secret: webhookSecret,
        target_type: formData.target_type,
        target_id: formData.target_id,
        agent_id: formData.agent_id && formData.agent_id !== "any" ? formData.agent_id : null,
        is_active: formData.is_active,
        next_scheduled_at: nextScheduled,
        created_by: user.id,
      });

      if (error) throw error;

      toast({
        title: "Trigger Created",
        description: "Scheduled trigger has been created successfully",
      });

      setShowCreateDialog(false);
      resetForm();
      await loadTriggers();
    } catch (error: any) {
      console.error("Error creating trigger:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create trigger",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateTrigger = async () => {
    if (!selectedTrigger || !formData.name.trim() || !formData.target_id) {
      toast({
        title: "Validation Error",
        description: "Please provide a name and select a target",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const nextScheduled =
        formData.trigger_type === "schedule"
          ? calculateNextScheduledTime(formData.schedule_type, formData.schedule_time, formData.schedule_day_of_week)
          : null;

      const { error } = await supabase
        .from("agent_scheduled_triggers")
        .update({
          name: formData.name,
          description: formData.description || null,
          trigger_type: formData.trigger_type,
          schedule_type: formData.trigger_type === "schedule" ? formData.schedule_type : null,
          schedule_time: formData.trigger_type === "schedule" ? formData.schedule_time : null,
          schedule_day_of_week:
            formData.trigger_type === "schedule" && formData.schedule_type === "weekly"
              ? formData.schedule_day_of_week
              : null,
          schedule_timezone: formData.schedule_timezone,
          deployment_environment: formData.trigger_type === "deployment" ? formData.deployment_environment : null,
          target_type: formData.target_type,
          target_id: formData.target_id,
          agent_id: formData.agent_id && formData.agent_id !== "any" ? formData.agent_id : null,
          is_active: formData.is_active,
          next_scheduled_at: nextScheduled,
        })
        .eq("id", selectedTrigger.id);

      if (error) throw error;

      toast({
        title: "Trigger Updated",
        description: "Scheduled trigger has been updated successfully",
      });

      setShowCreateDialog(false);
      setSelectedTrigger(null);
      resetForm();
      await loadTriggers();
    } catch (error: any) {
      console.error("Error updating trigger:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update trigger",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTrigger = async () => {
    if (!triggerToDelete) return;

    try {
      const { error } = await supabase.from("agent_scheduled_triggers").delete().eq("id", triggerToDelete.id);

      if (error) throw error;

      toast({
        title: "Trigger Deleted",
        description: "Scheduled trigger has been deleted",
      });

      setTriggerToDelete(null);
      await loadTriggers();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete trigger",
        variant: "destructive",
      });
    }
  };

  const handleToggleActive = async (trigger: ScheduledTrigger) => {
    try {
      const nextScheduled =
        !trigger.is_active && trigger.trigger_type === "schedule"
          ? calculateNextScheduledTime(
              trigger.schedule_type || "daily",
              trigger.schedule_time || "09:00",
              trigger.schedule_day_of_week || 1,
            )
          : null;

      const { error } = await supabase
        .from("agent_scheduled_triggers")
        .update({
          is_active: !trigger.is_active,
          next_scheduled_at: nextScheduled,
        })
        .eq("id", trigger.id);

      if (error) throw error;

      toast({
        title: trigger.is_active ? "Trigger Paused" : "Trigger Activated",
        description: `Trigger "${trigger.name}" has been ${trigger.is_active ? "paused" : "activated"}`,
      });

      await loadTriggers();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update trigger",
        variant: "destructive",
      });
    }
  };

  const handleManualTrigger = async (trigger: ScheduledTrigger) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create execution record
      const { error: execError } = await supabase.from("agent_trigger_executions").insert({
        trigger_id: trigger.id,
        project_id: projectId,
        trigger_source: "manual",
        status: "pending",
      });

      if (execError) throw execError;

      // Queue the job based on target type
      if (trigger.target_type === "test") {
        const { data: test, error: testError } = await supabase
          .from("nocode_tests")
          .select("*")
          .eq("id", trigger.target_id)
          .single();

        if (testError || !test) throw new Error("Target test not found");

        const runId = `TRIG-${Date.now().toString(36).toUpperCase()}`;

        const { error: jobError } = await supabase.from("agent_job_queue").insert({
          project_id: projectId,
          test_id: trigger.target_id,
          run_id: runId,
          base_url: test.base_url,
          steps: test.steps,
          agent_id: trigger.agent_id,
          created_by: user.id,
          status: "pending",
        });

        if (jobError) throw jobError;
      }

      // Update last triggered time
      await supabase
        .from("agent_scheduled_triggers")
        .update({ last_triggered_at: new Date().toISOString() })
        .eq("id", trigger.id);

      toast({
        title: "Trigger Executed",
        description: `Trigger "${trigger.name}" has been manually executed`,
      });

      await loadTriggers();
    } catch (error: any) {
      console.error("Error executing trigger:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to execute trigger",
        variant: "destructive",
      });
    }
  };

  const copyWebhookUrl = (trigger: ScheduledTrigger) => {
    const webhookUrl = `${window.location.origin}/api/triggers/${trigger.id}/webhook`;
    navigator.clipboard.writeText(webhookUrl);
    toast({
      title: "Copied",
      description: "Webhook URL copied to clipboard",
    });
  };

  const copyWebhookSecret = (trigger: ScheduledTrigger) => {
    if (trigger.deployment_webhook_secret) {
      navigator.clipboard.writeText(trigger.deployment_webhook_secret);
      toast({
        title: "Copied",
        description: "Webhook secret copied to clipboard",
      });
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      trigger_type: "schedule",
      schedule_type: "daily",
      schedule_time: "09:00",
      schedule_day_of_week: 1,
      schedule_timezone: "UTC",
      deployment_environment: "QA",
      target_type: "test",
      target_id: "",
      agent_id: "any",
      is_active: true,
    });
  };

  const openEditDialog = (trigger: ScheduledTrigger) => {
    setSelectedTrigger(trigger);
    setFormData({
      name: trigger.name,
      description: trigger.description || "",
      trigger_type: trigger.trigger_type,
      schedule_type: trigger.schedule_type || "daily",
      schedule_time: trigger.schedule_time || "09:00",
      schedule_day_of_week: trigger.schedule_day_of_week ?? 1,
      schedule_timezone: trigger.schedule_timezone || "UTC",
      deployment_environment: trigger.deployment_environment || "QA",
      target_type: trigger.target_type,
      target_id: trigger.target_id,
      agent_id: trigger.agent_id || "any",
      is_active: trigger.is_active,
    });
    setShowCreateDialog(true);
  };

  const openHistoryDialog = async (trigger: ScheduledTrigger) => {
    setSelectedTrigger(trigger);
    await loadExecutions(trigger.id);
    setShowHistoryDialog(true);
  };

  const getTargetName = (trigger: ScheduledTrigger): string => {
    if (trigger.target_type === "test") {
      return tests.find((t) => t.id === trigger.target_id)?.name || "Unknown Test";
    }
    return suites.find((s) => s.id === trigger.target_id)?.name || "Unknown Suite";
  };

  const getAgentName = (trigger: ScheduledTrigger): string => {
    if (!trigger.agent_id) return "Any Available";
    return agents.find((a) => a.id === trigger.agent_id)?.agent_name || "Unknown Agent";
  };

  const getScheduleDescription = (trigger: ScheduledTrigger): string => {
    if (trigger.trigger_type === "deployment") {
      return `On ${trigger.deployment_environment} deployment`;
    }

    const time = trigger.schedule_time || "09:00";

    switch (trigger.schedule_type) {
      case "hourly":
        return `Every hour at :${time.split(":")[1]}`;
      case "daily":
        return `Daily at ${time} ${trigger.schedule_timezone}`;
      case "weekly":
        const day = DAYS_OF_WEEK.find((d) => d.value === trigger.schedule_day_of_week)?.label || "Monday";
        return `Every ${day} at ${time} ${trigger.schedule_timezone}`;
      default:
        return "Unknown schedule";
    }
  };

  const getExecutionStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge className="bg-green-500/20 text-green-500 border-green-500/50">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Completed
          </Badge>
        );
      case "queued":
        return (
          <Badge className="bg-blue-500/20 text-blue-500 border-blue-500/50">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Queued
          </Badge>
        );
      case "pending":
        return (
          <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/50">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
      case "failed":
        return (
          <Badge className="bg-red-500/20 text-red-500 border-red-500/50">
            <XCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Scheduled Triggers</h3>
          <p className="text-sm text-muted-foreground">
            Configure automatic test execution based on schedules or deployment events
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => {
              resetForm();
              setSelectedTrigger(null);
              setShowCreateDialog(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Trigger
          </Button>
        </div>
      </div>

      {triggers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-medium mb-2">No Scheduled Triggers</h3>
            <p className="text-muted-foreground mb-4">
              Create triggers to run tests automatically on a schedule or after deployments
            </p>
            <Button
              onClick={() => {
                resetForm();
                setSelectedTrigger(null);
                setShowCreateDialog(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create First Trigger
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[400px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Schedule / Event</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Run</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {triggers.map((trigger) => (
                <TableRow key={trigger.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{trigger.name}</p>
                      {trigger.description && (
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">{trigger.description}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="gap-1">
                      {trigger.trigger_type === "schedule" ? (
                        <>
                          <Calendar className="h-3 w-3" />
                          Schedule
                        </>
                      ) : (
                        <>
                          <Rocket className="h-3 w-3" />
                          Deployment
                        </>
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{getScheduleDescription(trigger)}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Badge variant="secondary" className="text-xs">
                        {trigger.target_type === "test" ? "Test" : "Suite"}
                      </Badge>
                      <span className="text-sm truncate max-w-[100px]">{getTargetName(trigger)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">{getAgentName(trigger)}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={trigger.is_active ? "default" : "secondary"}>
                      {trigger.is_active ? "Active" : "Paused"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {trigger.last_triggered_at ? (
                      <span className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(trigger.last_triggered_at), { addSuffix: true })}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Never</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handleManualTrigger(trigger)} title="Run now">
                        <Play className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleActive(trigger)}
                        title={trigger.is_active ? "Pause" : "Activate"}
                      >
                        {trigger.is_active ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4 text-green-500" />
                        )}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openHistoryDialog(trigger)} title="View history">
                        <History className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEditDialog(trigger)} title="Edit">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setTriggerToDelete(trigger)} title="Delete">
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

      {/* Create/Edit Dialog */}
      <Dialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateDialog(false);
            setSelectedTrigger(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedTrigger ? "Edit Trigger" : "Create Scheduled Trigger"}</DialogTitle>
            <DialogDescription>
              Configure automatic test execution based on schedules or deployment events
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[400px] overflow-auto">
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Trigger Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Daily Smoke Tests"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="trigger_type">Trigger Type</Label>
                  <Select
                    value={formData.trigger_type}
                    onValueChange={(v) => setFormData({ ...formData, trigger_type: v as "schedule" | "deployment" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="schedule">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Time Schedule
                        </div>
                      </SelectItem>
                      <SelectItem value="deployment">
                        <div className="flex items-center gap-2">
                          <Rocket className="h-4 w-4" />
                          Deployment Event
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Describe when and why this trigger runs..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                />
              </div>

              {formData.trigger_type === "schedule" && (
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Schedule Configuration</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Frequency</Label>
                        <Select
                          value={formData.schedule_type}
                          onValueChange={(v) => setFormData({ ...formData, schedule_type: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="hourly">Hourly</SelectItem>
                            <SelectItem value="daily">Daily</SelectItem>
                            <SelectItem value="weekly">Weekly</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Time</Label>
                        <Input
                          type="time"
                          value={formData.schedule_time}
                          onChange={(e) => setFormData({ ...formData, schedule_time: e.target.value })}
                        />
                      </div>
                    </div>

                    {formData.schedule_type === "weekly" && (
                      <div className="space-y-2">
                        <Label>Day of Week</Label>
                        <Select
                          value={formData.schedule_day_of_week.toString()}
                          onValueChange={(v) => setFormData({ ...formData, schedule_day_of_week: parseInt(v) })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DAYS_OF_WEEK.map((day) => (
                              <SelectItem key={day.value} value={day.value.toString()}>
                                {day.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Timezone</Label>
                      <Select
                        value={formData.schedule_timezone}
                        onValueChange={(v) => setFormData({ ...formData, schedule_timezone: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIMEZONES.map((tz) => (
                            <SelectItem key={tz} value={tz}>
                              {tz}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              )}

              {formData.trigger_type === "deployment" && (
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Deployment Configuration</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Environment</Label>
                      <Select
                        value={formData.deployment_environment}
                        onValueChange={(v) => setFormData({ ...formData, deployment_environment: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="QA">QA</SelectItem>
                          <SelectItem value="UAT">UAT</SelectItem>
                          <SelectItem value="Staging">Staging</SelectItem>
                          <SelectItem value="Production">Production</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-sm text-muted-foreground">
                        After creating this trigger, you'll receive a webhook URL and secret to integrate with your
                        CI/CD pipeline. Call this webhook after deployments to trigger tests.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Execution Target</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Target Type</Label>
                      <Select
                        value={formData.target_type}
                        onValueChange={(v) =>
                          setFormData({ ...formData, target_type: v as "test" | "suite", target_id: "" })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="test">Single Test</SelectItem>
                          <SelectItem value="suite">Test Suite</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{formData.target_type === "test" ? "Test" : "Suite"}</Label>
                      <Select
                        value={formData.target_id}
                        onValueChange={(v) => setFormData({ ...formData, target_id: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select target..." />
                        </SelectTrigger>
                        <SelectContent>
                          {formData.target_type === "test"
                            ? tests.map((test) => (
                                <SelectItem key={test.id} value={test.id}>
                                  {test.name}
                                </SelectItem>
                              ))
                            : suites.map((suite) => (
                                <SelectItem key={suite.id} value={suite.id}>
                                  {suite.name}
                                </SelectItem>
                              ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Agent (Optional)</Label>
                    <Select value={formData.agent_id} onValueChange={(v) => setFormData({ ...formData, agent_id: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Any available agent" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any Available Agent</SelectItem>
                        {agents.map((agent) => (
                          <SelectItem key={agent.id} value={agent.id}>
                            {agent.agent_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="is_active"
                      checked={formData.is_active}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                    />
                    <Label htmlFor="is_active">Trigger is active</Label>
                  </div>
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                setSelectedTrigger(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button onClick={selectedTrigger ? handleUpdateTrigger : handleCreateTrigger} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {selectedTrigger ? "Update Trigger" : "Create Trigger"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog
        open={showHistoryDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowHistoryDialog(false);
            setSelectedTrigger(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Execution History - {selectedTrigger?.name}</DialogTitle>
            <DialogDescription>View the execution history for this trigger</DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-[400px] overflow-auto">
            {executions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No executions yet</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Triggered At</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {executions.map((exec) => (
                    <TableRow key={exec.id}>
                      <TableCell>{format(new Date(exec.triggered_at), "PPp")}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{exec.trigger_source}</Badge>
                      </TableCell>
                      <TableCell>{getExecutionStatusBadge(exec.status)}</TableCell>
                      <TableCell>
                        {exec.error_message && (
                          <span className="text-sm text-destructive truncate max-w-[200px] block">
                            {exec.error_message}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Webhook Info Dialog for deployment triggers */}
      {selectedTrigger?.trigger_type === "deployment" && selectedTrigger.deployment_webhook_secret && (
        <Card className="mt-4 border-dashed">
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Rocket className="h-4 w-4" />
              Webhook Configuration for "{selectedTrigger.name}"
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Webhook URL</Label>
              <div className="flex gap-2">
                <Input
                  value={`${window.location.origin}/api/triggers/${selectedTrigger.id}/webhook`}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button variant="outline" size="sm" onClick={() => copyWebhookUrl(selectedTrigger)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Webhook Secret</Label>
              <div className="flex gap-2">
                <Input
                  value={selectedTrigger.deployment_webhook_secret}
                  readOnly
                  className="font-mono text-xs"
                  type="password"
                />
                <Button variant="outline" size="sm" onClick={() => copyWebhookSecret(selectedTrigger)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!triggerToDelete} onOpenChange={(open) => !open && setTriggerToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Trigger</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{triggerToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTrigger}
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
