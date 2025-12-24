import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type IntegrationType = 'openai' | 'github' | 'jira' | 'azure_devops';

export interface IntegrationConfig {
  id: string;
  integration_type: string;
  config: Record<string, any> | null;
  enabled: boolean;
  project_id: string | null;
  user_id: string;
  created_at: string;
  updated_at: string;
}

interface UseIntegrationConfigOptions {
  projectId: string | null;
  integrationType?: IntegrationType;
  autoFetch?: boolean;
}

interface UseIntegrationConfigReturn {
  config: IntegrationConfig | null;
  configs: IntegrationConfig[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  saveConfig: (type: IntegrationType, configData: Record<string, any>, enabled?: boolean) => Promise<boolean>;
  getConfigValue: <T = any>(key: string, defaultValue?: T) => T | undefined;
  isEnabled: (type?: IntegrationType) => boolean;
}

export function useIntegrationConfig({
  projectId,
  integrationType,
  autoFetch = true,
}: UseIntegrationConfigOptions): UseIntegrationConfigReturn {
  const [configs, setConfigs] = useState<IntegrationConfig[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { toast } = useToast();

  const fetchConfigs = useCallback(async () => {
    if (!projectId) {
      setConfigs([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('integration_configs')
        .select('*')
        .eq('project_id', projectId);

      if (integrationType) {
        query = query.eq('integration_type', integrationType);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      setConfigs((data as IntegrationConfig[]) || []);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch integration configs');
      setError(error);
      console.error('Error fetching integration configs:', error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, integrationType]);

  const saveConfig = useCallback(
    async (type: IntegrationType, configData: Record<string, any>, enabled = true): Promise<boolean> => {
      if (!projectId) {
        toast({
          title: 'Error',
          description: 'No project selected',
          variant: 'destructive',
        });
        return false;
      }

      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) {
          throw new Error('User not authenticated');
        }

        const { data: existing } = await supabase
          .from('integration_configs')
          .select('id')
          .eq('project_id', projectId)
          .eq('integration_type', type)
          .maybeSingle();

        if (existing) {
          const { error: updateError } = await supabase
            .from('integration_configs')
            .update({
              config: configData,
              enabled,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);

          if (updateError) throw updateError;
        } else {
          const { error: insertError } = await supabase
            .from('integration_configs')
            .insert({
              project_id: projectId,
              integration_type: type,
              config: configData,
              enabled,
              user_id: userData.user.id,
            });

          if (insertError) throw insertError;
        }

        await fetchConfigs();
        return true;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to save integration config');
        console.error('Error saving integration config:', error);
        toast({
          title: 'Error',
          description: error.message,
          variant: 'destructive',
        });
        return false;
      }
    },
    [projectId, fetchConfigs, toast]
  );

  const getConfigValue = useCallback(
    <T = any>(key: string, defaultValue?: T): T | undefined => {
      const targetConfig = integrationType
        ? configs.find((c) => c.integration_type === integrationType)
        : configs[0];

      if (!targetConfig?.config) return defaultValue;

      const value = targetConfig.config[key];
      return value !== undefined ? (value as T) : defaultValue;
    },
    [configs, integrationType]
  );

  const isEnabled = useCallback(
    (type?: IntegrationType): boolean => {
      const targetType = type || integrationType;
      if (!targetType) {
        return configs.some((c) => c.enabled);
      }
      const targetConfig = configs.find((c) => c.integration_type === targetType);
      return targetConfig?.enabled ?? false;
    },
    [configs, integrationType]
  );

  useEffect(() => {
    if (autoFetch && projectId) {
      fetchConfigs();
    }
  }, [autoFetch, projectId, fetchConfigs]);

  const config = integrationType
    ? configs.find((c) => c.integration_type === integrationType) || null
    : configs[0] || null;

  return {
    config,
    configs,
    isLoading,
    error,
    refetch: fetchConfigs,
    saveConfig,
    getConfigValue,
    isEnabled,
  };
}
