import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAISafetyControls, AIGenerationResult } from "./useAISafetyControls";

interface FeedbackData {
  projectId: string;
  artifactType: "test_case" | "automation_step" | "defect_analysis";
  artifactId?: string;
  action: "approved" | "edited" | "rejected";
  originalContent: string;
  editedContent?: string;
  feedbackNotes?: string;
}

interface EmbeddingData {
  projectId: string;
  artifactType: string;
  artifactId: string;
  content: string;
  metadata?: Record<string, any>;
}

export const useAILearning = (projectId?: string) => {
  const { toast } = useToast();
  const [isStoringFeedback, setIsStoringFeedback] = useState(false);
  const [isStoringEmbedding, setIsStoringEmbedding] = useState(false);

  // Integrate safety controls
  const safetyControls = useAISafetyControls(projectId);

  // Store feedback on AI-generated content
  const storeFeedback = async (data: FeedbackData): Promise<boolean> => {
    setIsStoringFeedback(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        console.log("No session for feedback storage");
        return false;
      }

      const { error } = await supabase.from("qa_ai_feedback").insert({
        project_id: data.projectId,
        artifact_type: data.artifactType,
        artifact_id: data.artifactId,
        action: data.action,
        original_content: data.originalContent,
        edited_content: data.editedContent,
        feedback_notes: data.feedbackNotes,
        user_id: session.user.id,
      });

      if (error) {
        console.error("Error storing feedback:", error);
        return false;
      }

      console.log(`AI feedback stored: ${data.action} for ${data.artifactType}`);
      return true;
    } catch (error) {
      console.error("Error storing feedback:", error);
      return false;
    } finally {
      setIsStoringFeedback(false);
    }
  };

  // Store embedding for approved artifact (calls orchestrator)
  const storeEmbedding = async (data: EmbeddingData): Promise<boolean> => {
    setIsStoringEmbedding(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.log("No session for embedding storage");
        return false;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL || "https://lghzmijzfpvrcvogxpew.supabase.co"}/functions/v1/ai-qa-orchestrator`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            intent: "store_embedding",
            projectId: data.projectId,
            artifactType: data.artifactType,
            artifactId: data.artifactId,
            content: data.content,
            metadata: data.metadata,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Embedding storage failed:", errorText);
        return false;
      }

      const result = await response.json();
      console.log(`Embedding stored: ${result.action} for ${data.artifactType}`);
      return true;
    } catch (error) {
      console.error("Error storing embedding:", error);
      return false;
    } finally {
      setIsStoringEmbedding(false);
    }
  };

  // Approve embedding (mark as approved in database)
  const approveEmbedding = async (artifactType: string, artifactId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("qa_embeddings")
        .update({ 
          is_approved: true, 
          approval_count: 1
        })
        .eq("artifact_type", artifactType)
        .eq("artifact_id", artifactId);

      if (error) {
        console.error("Error approving embedding:", error);
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error approving embedding:", error);
      return false;
    }
  };

  // Track test case approval/edit
  const trackTestCaseFeedback = async (
    projectId: string,
    testCaseId: string,
    originalContent: string,
    finalContent: string,
    wasEdited: boolean,
    confidence?: number,
    appliedStandards?: string[]
  ): Promise<void> => {
    const action = wasEdited ? "edited" : "approved";
    
    // Store feedback with confidence and applied standards
    await storeFeedback({
      projectId,
      artifactType: "test_case",
      artifactId: testCaseId,
      action,
      originalContent,
      editedContent: wasEdited ? finalContent : undefined,
      feedbackNotes: JSON.stringify({
        actionType: action,
        confidence: confidence ?? 0.85, // Default to 85% if not provided
        wasEdited,
        appliedStandards: appliedStandards || [],
      }),
    });

    // Store/update embedding with final content
    await storeEmbedding({
      projectId,
      artifactType: "test_case",
      artifactId: testCaseId,
      content: finalContent,
      metadata: { wasEdited, confidence, approvedAt: new Date().toISOString() },
    });

    // Mark as approved if not edited significantly
    if (!wasEdited) {
      await approveEmbedding("test_case", testCaseId);
    }
  };

  // Track automation step feedback
  const trackAutomationFeedback = async (
    projectId: string,
    automationId: string,
    originalSteps: string,
    finalSteps: string,
    wasEdited: boolean,
    confidence?: number
  ): Promise<void> => {
    const action = wasEdited ? "edited" : "approved";
    
    await storeFeedback({
      projectId,
      artifactType: "automation_step",
      artifactId: automationId,
      action,
      originalContent: originalSteps,
      editedContent: wasEdited ? finalSteps : undefined,
      feedbackNotes: JSON.stringify({
        actionType: action,
        confidence: confidence ?? 0.75, // Default to 75% for automation
        wasEdited,
      }),
    });

    await storeEmbedding({
      projectId,
      artifactType: "automation_step",
      artifactId: automationId,
      content: finalSteps,
      metadata: { wasEdited, confidence, approvedAt: new Date().toISOString() },
    });

    if (!wasEdited) {
      await approveEmbedding("automation_step", automationId);
    }
  };

  // Generate test cases with learning context AND safety controls
  const generateTestCasesWithLearning = async (
    projectId: string,
    userStory: { title: string; description: string; acceptanceCriteria?: string },
    accessToken: string
  ): Promise<AIGenerationResult> => {
    // Check rate limit first
    const canProceed = await safetyControls.checkRateLimit(projectId);
    if (!canProceed) {
      throw new Error("Rate limit exceeded");
    }

    const startTime = Date.now();
    
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL || "https://lghzmijzfpvrcvogxpew.supabase.co"}/functions/v1/ai-qa-orchestrator`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            intent: "test_case_generation",
            projectId,
            userStory,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Generation failed: ${response.statusText}`);
      }

      const result = await response.json();
      const generationTimeMs = Date.now() - startTime;

      // Calculate confidence based on context used
      const similarExamplesFound = result.context?.similarExamplesUsed || 0;
      const patternsUsed = result.context?.patternsUsed || 0;
      const appliedStandardNames = result.context?.appliedStandardNames || [];
      const confidence = safetyControls.calculateConfidence(
        similarExamplesFound,
        patternsUsed,
        0.7 // Base response quality
      );

      // Process through safety controls
      const safeResult = await safetyControls.processGenerationResult(
        projectId,
        "test_case",
        result.testCases || result,
        confidence,
        {
          similarExamplesFound,
          patternsUsed,
          generationTimeMs,
          appliedStandardNames,
        }
      );

      return safeResult;
    } catch (error) {
      console.error("Error generating test cases with learning:", error);
      throw error;
    }
  };

  // Suggest automation with learning context AND safety controls
  const suggestAutomationWithLearning = async (
    projectId: string,
    testCase: { title: string; steps: string; expectedResult: string },
    accessToken: string
  ): Promise<AIGenerationResult> => {
    // Check rate limit first
    const canProceed = await safetyControls.checkRateLimit(projectId);
    if (!canProceed) {
      throw new Error("Rate limit exceeded");
    }

    const startTime = Date.now();
    
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL || "https://lghzmijzfpvrcvogxpew.supabase.co"}/functions/v1/ai-qa-orchestrator`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            intent: "automation_suggestion",
            projectId,
            testCase,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Suggestion failed: ${response.statusText}`);
      }

      const result = await response.json();
      const generationTimeMs = Date.now() - startTime;

      // Calculate confidence
      const similarExamplesFound = result.context?.similarAutomations?.length || 0;
      const patternsUsed = result.context?.patterns?.length || 0;
      const confidence = safetyControls.calculateConfidence(
        similarExamplesFound,
        patternsUsed,
        0.65 // Slightly lower base for automation
      );

      // Process through safety controls (automation always requires approval by default)
      const safeResult = await safetyControls.processGenerationResult(
        projectId,
        "automation_step",
        result.automationSteps || result,
        confidence,
        {
          similarExamplesFound,
          patternsUsed,
          generationTimeMs,
        }
      );

      return safeResult;
    } catch (error) {
      console.error("Error suggesting automation with learning:", error);
      throw error;
    }
  };

  return {
    // Original functions
    storeFeedback,
    storeEmbedding,
    approveEmbedding,
    trackTestCaseFeedback,
    trackAutomationFeedback,
    generateTestCasesWithLearning,
    suggestAutomationWithLearning,
    isStoringFeedback,
    isStoringEmbedding,
    
    // Safety controls
    safetyControls,
  };
};
