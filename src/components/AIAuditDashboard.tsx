import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  History, 
  Search, 
  Filter, 
  CheckCircle, 
  XCircle, 
  Clock, 
  RotateCcw, 
  Eye,
  RefreshCw,
  Loader2,
  ThumbsUp,
  ThumbsDown,
  BookOpen
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface QAStandard {
  id: string;
  name: string;
  standard_type: string;
  is_active: boolean | null;
}

interface AuditEntry {
  id: string;
  project_id: string | null;
  user_id: string;
  artifact_type: string;
  artifact_id: string | null;
  action: string;
  original_content: string;
  edited_content: string | null;
  feedback_notes: string | null;
  created_at: string;
}

interface AIAuditDashboardProps {
  projectId: string;
  isEmbedded?: boolean;
}

interface ConfirmAction {
  entryId: string;
  action: "approved" | "rejected";
  confidence?: number;
  artifactType: string;
}

export const AIAuditDashboard = ({ projectId, isEmbedded = false }: AIAuditDashboardProps) => {
  const { toast } = useToast();
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [artifactFilter, setArtifactFilter] = useState<string>("all");
  const [standardsFilter, setStandardsFilter] = useState<string>("all");
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [standards, setStandards] = useState<QAStandard[]>([]);

  const fetchAuditHistory = async () => {
    setIsLoading(true);
    try {
      // TODO: qa_ai_feedback table does not exist yet - using empty array
      // Once the table is created, uncomment the supabase query below
      setAuditEntries([]);
      setFilteredEntries([]);
    } catch (error) {
      console.error("Error fetching audit history:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStandards = async () => {
    try {
      // TODO: qa_standards table does not exist yet - using empty array
      setStandards([]);
    } catch (error) {
      console.error("Error fetching standards:", error);
    }
  };

  useEffect(() => {
    fetchAuditHistory();
    fetchStandards();
  }, [projectId]);

  // Parse applied standards from feedback notes
  const getAppliedStandards = (notes: string | null): string[] => {
    if (!notes) return [];
    try {
      const parsed = JSON.parse(notes);
      return parsed.appliedStandards || [];
    } catch {
      return [];
    }
  };

  // Get unique standards applied across all entries
  const getUniqueAppliedStandards = (): string[] => {
    const allStandards = new Set<string>();
    auditEntries.forEach(entry => {
      getAppliedStandards(entry.feedback_notes).forEach(s => allStandards.add(s));
    });
    return Array.from(allStandards);
  };

  useEffect(() => {
    let filtered = [...auditEntries];

    if (actionFilter !== "all") {
      filtered = filtered.filter(entry => entry.action === actionFilter);
    }

    if (artifactFilter !== "all") {
      filtered = filtered.filter(entry => entry.artifact_type === artifactFilter);
    }

    if (standardsFilter !== "all") {
      filtered = filtered.filter(entry => {
        const appliedStandards = getAppliedStandards(entry.feedback_notes);
        if (standardsFilter === "none") {
          return appliedStandards.length === 0;
        }
        return appliedStandards.includes(standardsFilter);
      });
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(entry =>
        entry.original_content?.toLowerCase().includes(query) ||
        entry.artifact_type?.toLowerCase().includes(query) ||
        entry.feedback_notes?.toLowerCase().includes(query)
      );
    }

    setFilteredEntries(filtered);
  }, [auditEntries, actionFilter, artifactFilter, standardsFilter, searchQuery]);

  const getActionBadge = (action: string) => {
    switch (action) {
      case "approved":
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      case "pending":
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case "rolled_back":
        return <Badge variant="outline" className="border-amber-500 text-amber-600"><RotateCcw className="h-3 w-3 mr-1" />Rolled Back</Badge>;
      case "edited":
        return <Badge variant="outline"><Eye className="h-3 w-3 mr-1" />Edited</Badge>;
      default:
        return <Badge variant="outline">{action}</Badge>;
    }
  };

  const getArtifactBadge = (type: string) => {
    switch (type) {
      case "test_case":
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-600">Test Case</Badge>;
      case "automation_step":
        return <Badge variant="outline" className="bg-purple-500/10 text-purple-600">Automation</Badge>;
      case "defect_analysis":
        return <Badge variant="outline" className="bg-orange-500/10 text-orange-600">Defect</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  const parseNotes = (notes: string | null): { confidence?: number; actionType?: string; notes?: string } => {
    if (!notes) return {};
    try {
      return JSON.parse(notes);
    } catch {
      return { notes };
    }
  };

  const truncateContent = (content: string, maxLength: number = 100) => {
    if (!content) return "-";
    if (content.length <= maxLength) return content;
    return content.slice(0, maxLength) + "...";
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    
    setUpdatingId(confirmAction.entryId);
    try {
      // TODO: qa_ai_feedback table does not exist yet - only updating local state
      setAuditEntries(prev => 
        prev.map(entry => 
          entry.id === confirmAction.entryId 
            ? { ...entry, action: confirmAction.action, feedback_notes: JSON.stringify({ actionType: confirmAction.action, confidence: confirmAction.confidence ?? 0.85 }) }
            : entry
        )
      );

      toast({ title: `Content ${confirmAction.action}` });
    } catch (error) {
      console.error("Error updating entry:", error);
      toast({ title: "Failed to update status", variant: "destructive" });
    } finally {
      setUpdatingId(null);
      setConfirmAction(null);
    }
  };

  const requestAction = (entryId: string, action: "approved" | "rejected", confidence: number | undefined, artifactType: string) => {
    setConfirmAction({ entryId, action, confidence, artifactType });
  };

  const uniqueActions = [...new Set(auditEntries.map(e => e.action))];
  const uniqueArtifacts = [...new Set(auditEntries.map(e => e.artifact_type))];
  const uniqueAppliedStandards = getUniqueAppliedStandards();

  const stats = {
    total: auditEntries.length,
    approved: auditEntries.filter(e => e.action === "approved").length,
    rejected: auditEntries.filter(e => e.action === "rejected").length,
    pending: auditEntries.filter(e => e.action === "pending").length,
  };

  // Calculate quality stats by standard
  const getStandardsQualityStats = () => {
    const statsMap: Record<string, { total: number; approved: number; rejected: number; avgConfidence: number }> = {};
    
    auditEntries.forEach(entry => {
      const appliedStandards = getAppliedStandards(entry.feedback_notes);
      const parsedNotes = parseNotes(entry.feedback_notes);
      const confidence = parsedNotes.confidence ?? 0;
      
      appliedStandards.forEach(standardName => {
        if (!statsMap[standardName]) {
          statsMap[standardName] = { total: 0, approved: 0, rejected: 0, avgConfidence: 0 };
        }
        statsMap[standardName].total++;
        if (entry.action === "approved") statsMap[standardName].approved++;
        if (entry.action === "rejected") statsMap[standardName].rejected++;
        statsMap[standardName].avgConfidence += confidence;
      });
    });

    // Calculate averages
    Object.keys(statsMap).forEach(key => {
      if (statsMap[key].total > 0) {
        statsMap[key].avgConfidence = statsMap[key].avgConfidence / statsMap[key].total;
      }
    });

    return statsMap;
  };

  const standardsQualityStats = getStandardsQualityStats();

  // Render standards badges for an entry
  const renderAppliedStandardsBadges = (notes: string | null) => {
    const appliedStandards = getAppliedStandards(notes);
    if (appliedStandards.length === 0) {
      return <span className="text-xs text-muted-foreground">None</span>;
    }
    return (
      <div className="flex flex-wrap gap-1">
        {appliedStandards.slice(0, 2).map((std, idx) => (
          <TooltipProvider key={idx}>
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="outline" className="text-xs bg-primary/5 truncate max-w-[80px]">
                  {std}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>{std}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
        {appliedStandards.length > 2 && (
          <Badge variant="outline" className="text-xs">+{appliedStandards.length - 2}</Badge>
        )}
      </div>
    );
  };

  const content = (
    <div className="space-y-4">
      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-3">
        <div className="p-3 rounded-lg bg-muted/50 text-center">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-xs text-muted-foreground">Total</div>
        </div>
        <div className="p-3 rounded-lg bg-green-500/10 text-center">
          <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
          <div className="text-xs text-muted-foreground">Approved</div>
        </div>
        <div className="p-3 rounded-lg bg-red-500/10 text-center">
          <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
          <div className="text-xs text-muted-foreground">Rejected</div>
        </div>
        <div className="p-3 rounded-lg bg-amber-500/10 text-center">
          <div className="text-2xl font-bold text-amber-600">{stats.pending}</div>
          <div className="text-xs text-muted-foreground">Pending</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search content..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-[140px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {uniqueActions.map(action => (
              <SelectItem key={action} value={action}>{action}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={artifactFilter} onValueChange={setArtifactFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Artifact Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {uniqueArtifacts.map(type => (
              <SelectItem key={type} value={type}>{type}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={standardsFilter} onValueChange={setStandardsFilter}>
          <SelectTrigger className="w-[160px]">
            <BookOpen className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Standards" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Standards</SelectItem>
            <SelectItem value="none">No Standards</SelectItem>
            {uniqueAppliedStandards.map(std => (
              <SelectItem key={std} value={std}>{std}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={fetchAuditHistory} disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>

      {/* Standards Quality Comparison */}
      {Object.keys(standardsQualityStats).length > 0 && (
        <div className="p-3 rounded-lg border bg-muted/30">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Quality by Applied Standard</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {Object.entries(standardsQualityStats).map(([name, stat]) => {
              const approvalRate = stat.total > 0 ? (stat.approved / stat.total) * 100 : 0;
              return (
                <div key={name} className="p-2 rounded bg-background border text-xs">
                  <div className="font-medium truncate" title={name}>{name}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-muted-foreground">{stat.total} uses</span>
                    <span className={approvalRate >= 70 ? "text-green-600" : approvalRate >= 40 ? "text-amber-600" : "text-red-600"}>
                      {approvalRate.toFixed(0)}% approved
                    </span>
                  </div>
                  {stat.avgConfidence > 0 && (
                    <div className="text-muted-foreground mt-0.5">
                      Avg conf: {(stat.avgConfidence * 100).toFixed(0)}%
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Table */}
      <ScrollArea className="h-[400px] rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Date</TableHead>
              <TableHead className="w-[90px]">Action</TableHead>
              <TableHead className="w-[100px]">Type</TableHead>
              <TableHead className="w-[120px]">Standards</TableHead>
              <TableHead className="w-[70px]">Conf.</TableHead>
              <TableHead>Content Preview</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : filteredEntries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No audit entries found
                </TableCell>
              </TableRow>
            ) : (
              filteredEntries.map((entry) => {
                const parsedNotes = parseNotes(entry.feedback_notes);
                const isPending = entry.action === "pending";
                const isUpdating = updatingId === entry.id;
                return (
                  <TableRow key={entry.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(entry.created_at), "MMM d, HH:mm")}
                    </TableCell>
                    <TableCell>{getActionBadge(entry.action)}</TableCell>
                    <TableCell>{getArtifactBadge(entry.artifact_type)}</TableCell>
                    <TableCell>{renderAppliedStandardsBadges(entry.feedback_notes)}</TableCell>
                    <TableCell>
                      {parsedNotes.confidence !== undefined ? (
                        <span className={`text-xs ${parsedNotes.confidence >= 0.85 ? "text-green-600" : parsedNotes.confidence >= 0.5 ? "text-amber-600" : "text-red-600"}`}>
                          {Math.round(parsedNotes.confidence * 100)}%
                        </span>
                      ) : "-"}
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate text-sm">
                      {truncateContent(entry.original_content, 80)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {isPending && (
                          <>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                              onClick={() => requestAction(entry.id, "approved", parsedNotes.confidence, entry.artifact_type)}
                              disabled={isUpdating}
                            >
                              {isUpdating && updatingId === entry.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsUp className="h-4 w-4" />}
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => requestAction(entry.id, "rejected", parsedNotes.confidence, entry.artifact_type)}
                              disabled={isUpdating}
                            >
                              <ThumbsDown className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm" onClick={() => setSelectedEntry(entry)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                              Audit Entry Details
                              {getActionBadge(entry.action)}
                            </DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <span className="text-muted-foreground">Date:</span>
                                <p className="font-medium">{format(new Date(entry.created_at), "PPpp")}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Artifact Type:</span>
                                <p>{getArtifactBadge(entry.artifact_type)}</p>
                              </div>
                              {parsedNotes.confidence !== undefined && (
                                <div>
                                  <span className="text-muted-foreground">Confidence:</span>
                                  <p className="font-medium">{Math.round(parsedNotes.confidence * 100)}%</p>
                                </div>
                              )}
                              {parsedNotes.actionType && (
                                <div>
                                  <span className="text-muted-foreground">Action Type:</span>
                                  <p className="font-medium">{parsedNotes.actionType}</p>
                                </div>
                              )}
                            </div>
                            
                            {/* Applied Standards Section */}
                            <div>
                              <span className="text-sm text-muted-foreground flex items-center gap-2">
                                <BookOpen className="h-4 w-4" />
                                Applied Standards:
                              </span>
                              <div className="mt-2">
                                {getAppliedStandards(entry.feedback_notes).length > 0 ? (
                                  <div className="flex flex-wrap gap-2">
                                    {getAppliedStandards(entry.feedback_notes).map((std, idx) => (
                                      <Badge key={idx} variant="secondary" className="bg-primary/10">
                                        {std}
                                      </Badge>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground italic">No standards were applied during generation</p>
                                )}
                              </div>
                            </div>

                            <div>
                              <span className="text-sm text-muted-foreground">Original Content:</span>
                              <pre className="mt-1 p-3 bg-muted rounded-md text-sm whitespace-pre-wrap overflow-x-auto max-h-[200px]">
                                {entry.original_content}
                              </pre>
                            </div>
                            {entry.edited_content && (
                              <div>
                                <span className="text-sm text-muted-foreground">Edited Content:</span>
                                <pre className="mt-1 p-3 bg-muted rounded-md text-sm whitespace-pre-wrap overflow-x-auto max-h-[200px]">
                                  {entry.edited_content}
                                </pre>
                              </div>
                            )}
                            {parsedNotes.notes && (
                              <div>
                                <span className="text-sm text-muted-foreground">Notes:</span>
                                <p className="mt-1 text-sm">{parsedNotes.notes}</p>
                              </div>
                            )}
                          </div>
                        </DialogContent>
                      </Dialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </ScrollArea>

      <div className="text-xs text-muted-foreground text-right">
        Showing {filteredEntries.length} of {auditEntries.length} entries
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.action === "approved" ? "Approve AI Content" : "Reject AI Content"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.action === "approved" 
                ? `Are you sure you want to approve this ${confirmAction?.artifactType?.replace("_", " ")}? This will mark the AI-generated content as verified and suitable for use.`
                : `Are you sure you want to reject this ${confirmAction?.artifactType?.replace("_", " ")}? This will mark the AI-generated content as unsuitable.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!updatingId}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAction}
              disabled={!!updatingId}
              className={confirmAction?.action === "approved" 
                ? "bg-green-600 hover:bg-green-700" 
                : "bg-destructive hover:bg-destructive/90"
              }
            >
              {updatingId ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : confirmAction?.action === "approved" ? (
                <ThumbsUp className="h-4 w-4 mr-2" />
              ) : (
                <ThumbsDown className="h-4 w-4 mr-2" />
              )}
              {confirmAction?.action === "approved" ? "Approve" : "Reject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  if (isEmbedded) {
    return content;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            <CardTitle>AI Audit Dashboard</CardTitle>
          </div>
        </div>
        <CardDescription>
          View all AI generation history, approvals, and rejections
        </CardDescription>
      </CardHeader>
      <CardContent>
        {content}
      </CardContent>
    </Card>
  );
};
