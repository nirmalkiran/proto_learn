import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface SafetyConfig {
  minConfidenceThreshold: number;
  autoApproveThreshold: number;
  maxDailyGenerations: number;
  requireApprovalForTestCases: boolean;
  requireApprovalForAPITestCases: boolean;
  requireApprovalForAutomation: boolean;
  requireApprovalForDefects: boolean;
  enableAuditLogging: boolean;
}

export const DEFAULT_SAFETY_CONFIG: SafetyConfig = {
  minConfidenceThreshold: 0.5,
  autoApproveThreshold: 0.85,
  maxDailyGenerations: 100,
  requireApprovalForTestCases: true,
  requireApprovalForAPITestCases: true,
  requireApprovalForAutomation: true,
  requireApprovalForDefects: true,
  enableAuditLogging: true,
};

export const useAISafetyControls = (projectId: string) => {
  const { toast } = useToast();
  const [safetyConfig, setSafetyConfig] = useState<SafetyConfig>(DEFAULT_SAFETY_CONFIG);
  const [isLoading, setIsLoading] = useState(false);
  const [dailyUsage, setDailyUsage] = useState(0);

  const loadSafetyConfig = useCallback(async (projectId: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("ai_safety_config")
        .select("*")
        .eq("project_id", projectId)
        .single();

      if (error && error.code !== "PGRST116") { // PGRST116 is "not found"
        throw error;
      }

      if (data) {
        setSafetyConfig(data.config as SafetyConfig);
      } else {
        // Use defaults if no config exists
        setSafetyConfig(DEFAULT_SAFETY_CONFIG);
      }

      // Load daily usage
      await loadDailyUsage(projectId);
    } catch (error) {
      console.error("Error loading safety config:", error);
      toast({
        title: "Error",
        description: "Failed to load safety configuration",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const saveSafetyConfig = useCallback(async (projectId: string, config: SafetyConfig) => {
    try {
      const { error } = await supabase
        .from("ai_safety_config")
        .upsert({
          project_id: projectId,
          config: config,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      setSafetyConfig(config);
      toast({
        title: "Success",
        description: "Safety configuration saved successfully",
      });
    } catch (error) {
      console.error("Error saving safety config:", error);
      toast({
        title: "Error",
        description: "Failed to save safety configuration",
        variant: "destructive",
      });
      throw error;
    }
  }, [toast]);

  const loadDailyUsage = useCallback(async (projectId: string) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const { count, error } = await supabase
        .from("qa_ai_feedback")
        .select("*", { count: "exact", head: true })
        .eq("project_id", projectId)
        .gte("created_at", today.toISOString())
        .lt("created_at", tomorrow.toISOString());

      if (error) throw error;
      setDailyUsage(count || 0);
    } catch (error) {
      console.error("Error loading daily usage:", error);
    }
  }, []);

  const getSafetyStatus = useCallback(() => {
    return {
      dailyUsage,
      dailyLimit: safetyConfig.maxDailyGenerations,
      isOverLimit: dailyUsage >= safetyConfig.maxDailyGenerations,
      confidenceThreshold: safetyConfig.minConfidenceThreshold,
      autoApproveThreshold: safetyConfig.autoApproveThreshold,
    };
  }, [dailyUsage, safetyConfig]);

  const checkContentApproval = useCallback((confidence: number, contentType: string) => {
    const requiresApproval = (() => {
      switch (contentType) {
        case "test_case":
          return safetyConfig.requireApprovalForTestCases;
        case "api_test_case":
          return safetyConfig.requireApprovalForAPITestCases;
        case "automation_script":
        case "nocode_steps":
          return safetyConfig.requireApprovalForAutomation;
        case "defect_report":
          return safetyConfig.requireApprovalForDefects;
        default:
          return true; // Default to requiring approval for unknown types
      }
    })();

    const canAutoApprove = confidence >= safetyConfig.autoApproveThreshold;
    const needsReview = confidence < safetyConfig.minConfidenceThreshold;

    return {
      requiresApproval,
      canAutoApprove: requiresApproval ? false : canAutoApprove,
      needsReview,
      isBlocked: dailyUsage >= safetyConfig.maxDailyGenerations,
    };
  }, [safetyConfig, dailyUsage]);

  const logAIGeneration = useCallback(async (
    projectId: string,
    artifactType: string,
    artifactId: string | null,
    confidence: number,
    content: string,
    appliedStandards?: string[]
  ) => {
    if (!safetyConfig.enableAuditLogging) return;

    try {
      const { error } = await supabase
        .from("qa_ai_feedback")
        .insert({
          project_id: projectId,
          user_id: (await supabase.auth.getUser()).data.user?.id || "",
          artifact_type: artifactType,
          artifact_id: artifactId,
          action: "pending",
          original_content: content,
          feedback_notes: JSON.stringify({
            confidence,
            appliedStandards: appliedStandards || [],
            actionType: "generated",
          }),
        });

      if (error) throw error;

      // Update daily usage
      await loadDailyUsage(projectId);
    } catch (error) {
      console.error("Error logging AI generation:", error);
    }
  }, [safetyConfig.enableAuditLogging, loadDailyUsage]);

  const logApproval = useCallback(async (
    entryId: string,
    approved: boolean,
    confidence: number,
    notes?: string
  ) => {
    if (!safetyConfig.enableAuditLogging) return;

    try {
      const { error } = await supabase
        .from("qa_ai_feedback")
        .update({
          action: approved ? "approved" : "rejected",
          feedback_notes: JSON.stringify({
            confidence,
            actionType: approved ? "approved" : "rejected",
            notes,
            updatedAt: new Date().toISOString(),
          }),
        })
        .eq("id", entryId);

      if (error) throw error;
    } catch (error) {
      console.error("Error logging approval:", error);
    }
  }, [safetyConfig.enableAuditLogging]);

  return {
    safetyConfig,
    isLoading,
    loadSafetyConfig,
    saveSafetyConfig,
    getSafetyStatus,
    checkContentApproval,
    logAIGeneration,
    logApproval,
  };
};
