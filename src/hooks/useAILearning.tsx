import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface LearningData {
  id: string;
  project_id: string;
  user_id: string;
  artifact_type: string;
  artifact_id: string;
  feedback_type: string;
  feedback_content: string;
  confidence_score: number;
  created_at: string;
  updated_at: string;
}

export const useAILearning = (projectId: string) => {
  const { toast } = useToast();
  const [learningData, setLearningData] = useState<LearningData[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadLearningData = useCallback(async (projectId: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("ai_learning_data")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setLearningData(data || []);
    } catch (error) {
      console.error("Error loading learning data:", error);
      toast({
        title: "Error",
        description: "Failed to load AI learning data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const addLearningData = useCallback(async (
    projectId: string,
    artifactType: string,
    artifactId: string,
    feedbackType: string,
    feedbackContent: string,
    confidenceScore: number
  ) => {
    try {
      const { data, error } = await supabase
        .from("ai_learning_data")
        .insert({
          project_id: projectId,
          user_id: (await supabase.auth.getUser()).data.user?.id || "",
          artifact_type: artifactType,
          artifact_id: artifactId,
          feedback_type: feedbackType,
          feedback_content: feedbackContent,
          confidence_score: confidenceScore,
        })
        .select()
        .single();

      if (error) throw error;

      setLearningData(prev => [data, ...prev]);
      toast({
        title: "Success",
        description: "Learning data added successfully",
      });
    } catch (error) {
      console.error("Error adding learning data:", error);
      toast({
        title: "Error",
        description: "Failed to add learning data",
        variant: "destructive",
      });
      throw error;
    }
  }, [toast]);

  const updateLearningData = useCallback(async (
    id: string,
    updates: Partial<Pick<LearningData, "feedback_content" | "confidence_score">>
  ) => {
    try {
      const { data, error } = await supabase
        .from("ai_learning_data")
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      setLearningData(prev =>
        prev.map(item => item.id === id ? data : item)
      );
      toast({
        title: "Success",
        description: "Learning data updated successfully",
      });
    } catch (error) {
      console.error("Error updating learning data:", error);
      toast({
        title: "Error",
        description: "Failed to update learning data",
        variant: "destructive",
      });
      throw error;
    }
  }, [toast]);

  const deleteLearningData = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from("ai_learning_data")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setLearningData(prev => prev.filter(item => item.id !== id));
      toast({
        title: "Success",
        description: "Learning data deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting learning data:", error);
      toast({
        title: "Error",
        description: "Failed to delete learning data",
        variant: "destructive",
      });
      throw error;
    }
  }, [toast]);

  return {
    learningData,
    isLoading,
    loadLearningData,
    addLearningData,
    updateLearningData,
    deleteLearningData,
  };
};
