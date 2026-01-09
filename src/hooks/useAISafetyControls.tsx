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
      // Use ai_safety_controls table instead of ai_safety_config
      const { data, error } = await supabase
        .from("ai_safety_controls")
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data) {
        // Map database columns to SafetyConfig interface
        setSafetyConfig({
          minConfidenceThreshold: data.confidence_threshold ?? 0.5,
          autoApproveThreshold: 0.85, // Not in DB, use default
          maxDailyGenerations: data.rate_limit_daily ?? 100,
          requireApprovalForTestCases: data.require_approval_test_cases ?? true,
          requireApprovalForAPITestCases: data.require_approval_test_cases ?? true,
          requireApprovalForAutomation: data.require_approval_user_stories ?? true,
          requireApprovalForDefects: data.require_approval_test_plans ?? true,
          enableAuditLogging: data.enable_audit_logging ?? true,
        });
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
      const user = await supabase.auth.getUser();
      const userId = user.data.user?.id;
      
      if (!userId) {
        throw new Error("User not authenticated");
      }

      const { error } = await supabase
        .from("ai_safety_controls")
        .upsert({
          project_id: projectId,
          user_id: userId,
          confidence_threshold: config.minConfidenceThreshold,
          rate_limit_daily: config.maxDailyGenerations,
          require_approval_test_cases: config.requireApprovalForTestCases,
          require_approval_test_plans: config.requireApprovalForDefects,
          require_approval_user_stories: config.requireApprovalForAutomation,
          enable_audit_logging: config.enableAuditLogging,
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
        .from("ai_usage_logs")
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
      const user = await supabase.auth.getUser();
      const userId = user.data.user?.id;
      
      if (!userId) return;

      const { error } = await supabase
        .from("ai_usage_logs")
        .insert({
          project_id: projectId,
          user_id: userId,
          feature_type: artifactType,
          success: true,
          tokens_used: Math.round(content.length / 4), // Approximate tokens
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

    // Log approval is a no-op for now since we don't have a dedicated approvals table
    console.log("Approval logged:", { entryId, approved, confidence, notes });
  }, [safetyConfig.enableAuditLogging]);

  const checkRateLimit = useCallback(() => {
    return {
      allowed: dailyUsage < safetyConfig.maxDailyGenerations,
      remaining: Math.max(0, safetyConfig.maxDailyGenerations - dailyUsage),
      limit: safetyConfig.maxDailyGenerations,
    };
  }, [dailyUsage, safetyConfig.maxDailyGenerations]);

  return {
    safetyConfig,
    isLoading,
    loadSafetyConfig,
    saveSafetyConfig,
    getSafetyStatus,
    checkContentApproval,
    logAIGeneration,
    logApproval,
    checkRateLimit,
  };
};
