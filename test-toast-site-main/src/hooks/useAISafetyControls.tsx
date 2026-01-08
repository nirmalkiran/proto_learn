import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// Safety configuration thresholds
export interface SafetyConfig {
  minConfidenceThreshold: number; // 0-1, below this requires human approval
  autoApproveThreshold: number; // 0-1, above this can auto-approve
  maxDailyGenerations: number; // Rate limiting
  requireApprovalForAutomation: boolean;
  requireApprovalForTestCases: boolean;
  requireApprovalForDefects: boolean;
  requireApprovalForAPITestCases: boolean;
  enableAuditLogging: boolean;
}

export const DEFAULT_SAFETY_CONFIG: SafetyConfig = {
  minConfidenceThreshold: 0.3, // Reject below 30%
  autoApproveThreshold: 0.85, // Auto-approve above 85%
  maxDailyGenerations: 100,
  requireApprovalForAutomation: true, // Always require approval for automation
  requireApprovalForTestCases: false, // Test cases can be auto-approved if high confidence
  requireApprovalForDefects: false, // Defect reports can be auto-approved
  requireApprovalForAPITestCases: false, // API test cases can be auto-approved
  enableAuditLogging: true,
};

export interface AIGenerationResult {
  content: any;
  confidence: number;
  requiresApproval: boolean;
  auditId?: string;
  warnings: string[];
  metadata: {
    similarExamplesFound: number;
    patternsUsed: number;
    generationTimeMs: number;
    appliedStandardNames?: string[];
  };
}

export interface AuditLogEntry {
  id?: string;
  projectId: string;
  userId: string;
  actionType: "generation" | "approval" | "rejection" | "rollback" | "auto_approve";
  artifactType: "test_case" | "automation_step" | "defect_analysis";
  artifactId?: string;
  confidence?: number;
  decision: "approved" | "pending" | "rejected" | "rolled_back";
  content: string;
  previousContent?: string;
  notes?: string;
  createdAt?: string;
}

export interface PendingApproval {
  id: string;
  projectId: string;
  artifactType: string;
  content: any;
  confidence: number;
  warnings: string[];
  createdAt: string;
  expiresAt: string;
  metadata: Record<string, any>;
}

export const useAISafetyControls = (projectId?: string) => {
  const { toast } = useToast();
  const [safetyConfig, setSafetyConfig] = useState<SafetyConfig>(DEFAULT_SAFETY_CONFIG);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dailyUsageCount, setDailyUsageCount] = useState(0);

  // Load daily usage count
  const loadDailyUsageCount = useCallback(async (pId: string) => {
    try {
      const today = new Date().toISOString().split("T")[0];
      
      const { count, error } = await supabase
        .from("ai_usage_logs")
        .select("*", { count: "exact", head: true })
        .eq("project_id", pId)
        .gte("created_at", `${today}T00:00:00Z`);

      if (!error) {
        setDailyUsageCount(count || 0);
      }
    } catch (error) {
      console.error("Error loading daily usage count:", error);
    }
  }, []);

  // Load safety config for project
  const loadSafetyConfig = useCallback(async (pId: string) => {
    try {
      const { data } = await supabase
        .from("integration_configs")
        .select("config")
        .eq("project_id", pId)
        .eq("integration_id", "ai_safety_controls")
        .single();

      if (data?.config && typeof data.config === "object") {
        setSafetyConfig({ ...DEFAULT_SAFETY_CONFIG, ...(data.config as unknown as Partial<SafetyConfig>) });
      }
      
      // Also load daily usage count
      await loadDailyUsageCount(pId);
    } catch (error) {
      console.log("Using default safety config");
      // Still try to load usage count even if config fails
      await loadDailyUsageCount(pId);
    }
  }, [loadDailyUsageCount]);

  // Save safety config for project
  const saveSafetyConfig = async (pId: string, config: Partial<SafetyConfig>) => {
    try {
      const newConfig = { ...safetyConfig, ...config };
      
      // First check if config exists
      const { data: existing } = await supabase
        .from("integration_configs")
        .select("id")
        .eq("project_id", pId)
        .eq("integration_id", "ai_safety_controls")
        .maybeSingle();

      let error;
      if (existing) {
        // Update existing config
        const result = await supabase
          .from("integration_configs")
          .update({
            config: newConfig,
            enabled: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        error = result.error;
      } else {
        // Insert new config
        const result = await supabase
          .from("integration_configs")
          .insert({
            project_id: pId,
            integration_id: "ai_safety_controls",
            config: newConfig,
            enabled: true,
          });
        error = result.error;
      }

      if (error) throw error;
      
      setSafetyConfig(newConfig);
      toast({ title: "Safety controls updated" });
      return true;
    } catch (error) {
      console.error("Error saving safety config:", error);
      toast({ title: "Failed to save safety config", variant: "destructive" });
      return false;
    }
  };

  // Check rate limits - fetches config fresh to ensure accurate limit
  const checkRateLimit = async (pId: string): Promise<boolean> => {
    try {
      // Always fetch fresh config to ensure we have the current limit
      const { data: configData } = await supabase
        .from("integration_configs")
        .select("config")
        .eq("project_id", pId)
        .eq("integration_id", "ai_safety_controls")
        .maybeSingle();

      const currentConfig = configData?.config 
        ? { ...DEFAULT_SAFETY_CONFIG, ...(configData.config as unknown as Partial<SafetyConfig>) }
        : safetyConfig;

      const maxGenerations = currentConfig.maxDailyGenerations;

      const today = new Date().toISOString().split("T")[0];
      
      const { count, error } = await supabase
        .from("ai_usage_logs")
        .select("*", { count: "exact", head: true })
        .eq("project_id", pId)
        .gte("created_at", `${today}T00:00:00Z`);

      if (error) throw error;
      
      const currentCount = count || 0;
      setDailyUsageCount(currentCount);
      
      console.log(`Rate limit check: ${currentCount}/${maxGenerations} generations used today`);
      
      if (currentCount >= maxGenerations) {
        toast({
          title: "Rate limit reached",
          description: `Daily AI generation limit (${maxGenerations}) reached. Try again tomorrow.`,
          variant: "destructive",
        });
        return false;
      }
      
      return true;
    } catch (error) {
      console.error("Error checking rate limit:", error);
      return true; // Allow on error
    }
  };

  // Evaluate confidence and determine if approval is needed
  const evaluateConfidence = (
    confidence: number,
    artifactType: "test_case" | "automation_step" | "defect_analysis"
  ): { requiresApproval: boolean; warnings: string[] } => {
    const warnings: string[] = [];
    let requiresApproval = false;

    // Check minimum threshold
    if (confidence < safetyConfig.minConfidenceThreshold) {
      warnings.push(`Low confidence (${(confidence * 100).toFixed(0)}%) - content may be unreliable`);
      requiresApproval = true;
    }

    // Check if below auto-approve threshold
    if (confidence < safetyConfig.autoApproveThreshold) {
      warnings.push(`Confidence below auto-approval threshold (${(safetyConfig.autoApproveThreshold * 100).toFixed(0)}%)`);
      requiresApproval = true;
    }

    // Check artifact-specific requirements
    if (artifactType === "automation_step" && safetyConfig.requireApprovalForAutomation) {
      requiresApproval = true;
      if (confidence >= safetyConfig.autoApproveThreshold) {
        warnings.push("Automation scripts always require human approval");
      }
    }

    if (artifactType === "test_case" && safetyConfig.requireApprovalForTestCases) {
      requiresApproval = true;
    }

    return { requiresApproval, warnings };
  };

  // Log audit entry
  const logAudit = async (entry: Omit<AuditLogEntry, "id" | "createdAt">, appliedStandardNames?: string[]): Promise<string | null> => {
    if (!safetyConfig.enableAuditLogging) return null;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return null;

      const { data, error } = await supabase
        .from("qa_ai_feedback")
        .insert({
          project_id: entry.projectId,
          user_id: entry.userId || session.user.id,
          artifact_type: entry.artifactType,
          artifact_id: entry.artifactId,
          action: entry.decision,
          original_content: entry.content,
          edited_content: entry.previousContent,
          feedback_notes: JSON.stringify({
            actionType: entry.actionType,
            confidence: entry.confidence,
            notes: entry.notes,
            appliedStandards: appliedStandardNames || [],
          }),
        })
        .select("id")
        .single();

      if (error) throw error;
      return data?.id || null;
    } catch (error) {
      console.error("Error logging audit:", error);
      return null;
    }
  };

  // Process AI generation result with safety checks
  const processGenerationResult = async (
    pId: string,
    artifactType: "test_case" | "automation_step" | "defect_analysis",
    content: any,
    confidence: number,
    metadata: AIGenerationResult["metadata"]
  ): Promise<AIGenerationResult> => {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id || "";

    const { requiresApproval, warnings } = evaluateConfidence(confidence, artifactType);

    // Log the generation with applied standards
    const auditId = await logAudit({
      projectId: pId,
      userId,
      actionType: "generation",
      artifactType,
      confidence,
      decision: requiresApproval ? "pending" : "approved",
      content: JSON.stringify(content),
      notes: warnings.join("; "),
    }, metadata.appliedStandardNames);

    // If requires approval, add to pending queue
    if (requiresApproval) {
      const pendingItem: PendingApproval = {
        id: auditId || crypto.randomUUID(),
        projectId: pId,
        artifactType,
        content,
        confidence,
        warnings,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
        metadata,
      };
      setPendingApprovals(prev => [...prev, pendingItem]);
    }

    return {
      content,
      confidence,
      requiresApproval,
      auditId: auditId || undefined,
      warnings,
      metadata,
    };
  };

  // Approve pending item
  const approvePending = async (pendingId: string, editedContent?: any): Promise<boolean> => {
    setIsLoading(true);
    try {
      const pending = pendingApprovals.find(p => p.id === pendingId);
      if (!pending) {
        toast({ title: "Approval item not found", variant: "destructive" });
        return false;
      }

      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id || "";

      // Log approval
      await logAudit({
        projectId: pending.projectId,
        userId,
        actionType: "approval",
        artifactType: pending.artifactType as any,
        artifactId: pendingId,
        confidence: pending.confidence,
        decision: "approved",
        content: JSON.stringify(editedContent || pending.content),
        previousContent: JSON.stringify(pending.content),
        notes: editedContent ? "Approved with edits" : "Approved as-is",
      });

      // Remove from pending
      setPendingApprovals(prev => prev.filter(p => p.id !== pendingId));

      toast({ title: "AI content approved" });
      return true;
    } catch (error) {
      console.error("Error approving:", error);
      toast({ title: "Failed to approve", variant: "destructive" });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Reject pending item
  const rejectPending = async (pendingId: string, reason?: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const pending = pendingApprovals.find(p => p.id === pendingId);
      if (!pending) {
        toast({ title: "Approval item not found", variant: "destructive" });
        return false;
      }

      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id || "";

      // Log rejection
      await logAudit({
        projectId: pending.projectId,
        userId,
        actionType: "rejection",
        artifactType: pending.artifactType as any,
        artifactId: pendingId,
        confidence: pending.confidence,
        decision: "rejected",
        content: JSON.stringify(pending.content),
        notes: reason || "Rejected by user",
      });

      // Remove from pending
      setPendingApprovals(prev => prev.filter(p => p.id !== pendingId));

      toast({ title: "AI content rejected" });
      return true;
    } catch (error) {
      console.error("Error rejecting:", error);
      toast({ title: "Failed to reject", variant: "destructive" });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Rollback a previous approval
  const rollbackApproval = async (
    pId: string,
    artifactType: "test_case" | "automation_step" | "defect_analysis",
    artifactId: string,
    previousContent: string,
    currentContent: string,
    reason?: string
  ): Promise<boolean> => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id || "";

      // Log rollback
      await logAudit({
        projectId: pId,
        userId,
        actionType: "rollback",
        artifactType,
        artifactId,
        decision: "rolled_back",
        content: currentContent,
        previousContent,
        notes: reason || "Rolled back to previous version",
      });

      toast({ title: "AI content rolled back" });
      return true;
    } catch (error) {
      console.error("Error rolling back:", error);
      toast({ title: "Failed to rollback", variant: "destructive" });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Get audit history for an artifact
  const getAuditHistory = async (
    pId: string,
    artifactType?: string,
    artifactId?: string
  ): Promise<AuditLogEntry[]> => {
    try {
      let query = supabase
        .from("qa_ai_feedback")
        .select("*")
        .eq("project_id", pId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (artifactType) {
        query = query.eq("artifact_type", artifactType);
      }
      if (artifactId) {
        query = query.eq("artifact_id", artifactId);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map(item => {
        let parsedNotes: any = {};
        try {
          parsedNotes = JSON.parse(item.feedback_notes || "{}");
        } catch {}

        return {
          id: item.id,
          projectId: item.project_id || "",
          userId: item.user_id,
          actionType: parsedNotes.actionType || "generation",
          artifactType: item.artifact_type as any,
          artifactId: item.artifact_id || undefined,
          confidence: parsedNotes.confidence,
          decision: item.action as any,
          content: item.original_content,
          previousContent: item.edited_content || undefined,
          notes: parsedNotes.notes,
          createdAt: item.created_at,
        };
      });
    } catch (error) {
      console.error("Error fetching audit history:", error);
      return [];
    }
  };

  // Calculate confidence from AI response metadata
  const calculateConfidence = (
    similarExamplesFound: number,
    patternsUsed: number,
    responseQuality: number = 0.7
  ): number => {
    // Base confidence from similar examples (0-40%)
    const exampleBonus = Math.min(similarExamplesFound * 0.08, 0.4);
    
    // Pattern bonus (0-20%)
    const patternBonus = Math.min(patternsUsed * 0.05, 0.2);
    
    // Response quality weight (0-40%)
    const qualityScore = responseQuality * 0.4;
    
    return Math.min(exampleBonus + patternBonus + qualityScore, 1.0);
  };

  // Get safety status summary
  const getSafetyStatus = () => ({
    config: safetyConfig,
    pendingCount: pendingApprovals.length,
    dailyUsage: dailyUsageCount,
    dailyLimit: safetyConfig.maxDailyGenerations,
    rateLimitRemaining: safetyConfig.maxDailyGenerations - dailyUsageCount,
  });

  return {
    safetyConfig,
    loadSafetyConfig,
    saveSafetyConfig,
    checkRateLimit,
    evaluateConfidence,
    processGenerationResult,
    approvePending,
    rejectPending,
    rollbackApproval,
    getAuditHistory,
    calculateConfidence,
    getSafetyStatus,
    pendingApprovals,
    isLoading,
    dailyUsageCount,
  };
};
