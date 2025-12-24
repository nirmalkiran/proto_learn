import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  Settings, 
  CheckCircle, 
  AlertCircle, 
  ExternalLink,
  Key,
  Server,
  Zap,
  RefreshCw,
  Github,
  GitBranch,
  Check,
  X,
  Loader2
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import FileBrowser from "./FileBrowser";
import GitHistory from "./GitHistory";
import { validateEmail, validateUrl, validateOpenAIApiKey, validateProjectKey, sanitizeText } from "@/lib/security";
import { useAuth } from "@/hooks/useAuth";

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<any>;
  status: 'connected' | 'disconnected' | 'error';
  enabled: boolean;
  lastSync?: string;
  config?: Record<string, any>;
}

interface ProjectGitConfig {
  git_repository_url?: string;
  git_branch?: string;
  git_sync_status?: string;
  git_last_sync?: string;
}

const extractTextFromJiraContent = (content: any): string => {
  if (typeof content === 'string') return content;
  if (!content) return 'No description available';
  
  // Handle Jira's Atlassian Document Format (ADF)
  if (content.content && Array.isArray(content.content)) {
    const textParts: string[] = [];
    
    const extractText = (node: any) => {
      if (node.type === 'text' && node.text) {
        textParts.push(node.text);
      } else if (node.content && Array.isArray(node.content)) {
        node.content.forEach(extractText);
      }
    };
    
    content.content.forEach(extractText);
    return textParts.join(' ').trim() || 'No description available';
  }
  
  return 'No description available';
};

// Load saved configurations from database (project-specific)
const loadSavedConfigurations = async (projectId: string) => {
  try {
    const { data, error } = await supabase
      .from('integration_configs')
      .select('*')
      .eq('project_id', projectId);

    if (error) throw error;

    const configs: Record<string, any> = {};
    data?.forEach((config) => {
      const configData = config.config && typeof config.config === 'object' ? config.config : {};
      configs[config.integration_type] = {
        ...configData,
        enabled: config.enabled,
        lastSync: config.updated_at
      };
    });

    return configs;
  } catch (error) {
    console.error('Error loading integration configs:', error);
    return {};
  }
};

// Save configurations to database (project-specific)
const saveConfigurations = async (integrationId: string, config: any, projectId: string, enabled: boolean = true, userId?: string) => {
  // If userId not provided, get it from auth
  let effectiveUserId = userId;
  if (!effectiveUserId) {
    const { data: { user } } = await supabase.auth.getUser();
    effectiveUserId = user?.id;
  }
  if (!effectiveUserId) {
    throw new Error('User not authenticated');
  }
  try {
    const { error } = await supabase
      .from('integration_configs')
      .upsert({
        project_id: projectId,
        integration_type: integrationId,
        config: config,
        enabled: enabled,
        user_id: effectiveUserId,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'id'
      });

    if (error) throw error;
  } catch (error) {
    console.error('Error saving integration config:', error);
    throw error;
  }
};

interface IntegrationsProps {
  projectId: string;
}

export const Integrations = ({ projectId }: IntegrationsProps) => {
  const { toast } = useToast();
  const { session } = useAuth();
  
  // State for saved configurations
  const [savedConfigs, setSavedConfigs] = useState<Record<string, any>>({});
  
  const [integrations, setIntegrations] = useState<Integration[]>([
    {
      id: 'git',
      name: 'Git Repository',
      description: 'Connect your project to a GitHub repository for version control and automated test management',
      icon: Github,
      status: 'disconnected',
      enabled: true,
      lastSync: undefined
    },
    {
      id: 'jira',
      name: 'Jira',
      description: 'Import user stories and requirements from Jira projects',
      icon: ExternalLink,
      status: 'disconnected',
      enabled: true,
      lastSync: undefined
    },
    {
      id: 'azure-devops',
      name: 'Azure DevOps',
      description: 'Sync work items and user stories from Azure DevOps',
      icon: Server,
      status: 'disconnected',
      enabled: true,
      lastSync: undefined
    },
      {
        id: 'openai',
        name: 'Azure OpenAI',
        description: 'AI-powered test case generation using Azure OpenAI GPT models',
        icon: Zap,
        status: 'disconnected',
        enabled: true,
        lastSync: undefined
      },
      {
        id: 'browserbase',
        name: 'Browserbase',
        description: 'Cloud browser automation for running no-code tests',
        icon: Server,
        status: 'disconnected',
        enabled: true,
        lastSync: undefined
      }
  ]);

  const [showApiKeyForm, setShowApiKeyForm] = useState<string | null>(null);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [jiraConfig, setJiraConfig] = useState({
    url: '',
    email: '',
    projectKey: ''
  });
  const [azureDevOpsConfig, setAzureDevOpsConfig] = useState({
    organizationUrl: '',
    projectName: ''
  });
  const [openAiConfig, setOpenAiConfig] = useState({
    endpoint: '',
    apiKey: '',
    deploymentId: '',
    apiVersion: '2024-02-15-preview'
  });
  const [browserbaseConfig, setBrowserbaseConfig] = useState({
    apiKey: '',
    projectId: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [jiraStories, setJiraStories] = useState<any[]>([]);
  const [azureDevOpsStories, setAzureDevOpsStories] = useState<any[]>([]);
  const [generatedTestCases, setGeneratedTestCases] = useState<any[]>([]);
  
  // Git repository state
  const [gitConfig, setGitConfig] = useState<ProjectGitConfig>({});
  const [gitLoading, setGitLoading] = useState(true);
  const [gitConnecting, setGitConnecting] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [branch, setBranch] = useState("main");

  // Load configurations on component mount
  useEffect(() => {
    const loadConfigurations = async () => {
      const configs = await loadSavedConfigurations(projectId);
      setSavedConfigs(configs);
      
      // Update integrations with loaded configs
      setIntegrations(prev => prev.map(integration => {
        const config = configs[integration.id];
        let status: 'connected' | 'disconnected' | 'error' = 'disconnected';
        
        if (config) {
          // Check if configuration is complete for each integration type
          if (integration.id === 'jira') {
            // JIRA requires url, email, projectKey, and apiToken
            if (config.url && config.email && config.projectKey && config.apiToken) {
              status = 'connected';
            }
          } else if (integration.id === 'azure-devops') {
            // Azure DevOps requires organizationUrl and projectName
            if (config.organizationUrl && config.projectName && config.personalAccessToken) {
              status = 'connected';
            }
          } else if (integration.id === 'openai') {
            // OpenAI requires endpoint, apiKey, and deploymentId
            if (config.endpoint && config.apiKey && config.deploymentId) {
              status = 'connected';
            }
          } else if (integration.id === 'browserbase') {
            // Browserbase requires apiKey and projectId
            if (config.apiKey && config.projectId) {
              status = 'connected';
            }
          } else {
            // For other integrations, check for apiKey
            if (config.apiKey) {
              status = 'connected';
            }
          }
        }
        
        return {
          ...integration,
          status,
          enabled: config?.enabled !== false,
          lastSync: status === 'connected' ? config?.lastSync : undefined
        };
      }));

      // Update config states with saved values
      if (configs.jira) {
        setJiraConfig(configs.jira);
      }
      if (configs['azure-devops']) {
        setAzureDevOpsConfig(configs['azure-devops']);
      }
      if (configs.openai) {
        setOpenAiConfig(configs.openai);
      }
      if (configs.browserbase) {
        setBrowserbaseConfig(configs.browserbase);
      }
    };

    loadConfigurations();
    
    // Load Git config
    fetchGitConfig();
    // Set up periodic refresh of git config to get latest sync status
    const interval = setInterval(fetchGitConfig, 30000); // Refresh every 30 seconds
    
    return () => clearInterval(interval);
  }, [projectId]);

  const toggleIntegration = async (id: string) => {
    const updatedIntegration = integrations.find(i => i.id === id);
    if (!updatedIntegration) return;

    const newEnabled = !updatedIntegration.enabled;
    
    setIntegrations(prev => prev.map(integration => 
      integration.id === id 
        ? { ...integration, enabled: newEnabled }
        : integration
    ));
    
    // Save enabled state to database
    try {
      const existingConfig = savedConfigs[id] || {};
      await saveConfigurations(id, existingConfig, projectId, newEnabled);
      
      // Update local state
      setSavedConfigs(prev => ({
        ...prev,
        [id]: { ...existingConfig, enabled: newEnabled }
      }));
    } catch (error) {
      console.error('Error saving integration state:', error);
      toast({
        title: "Error",
        description: "Failed to save integration state",
        variant: "destructive",
      });
    }
    
    toast({
      title: updatedIntegration.enabled ? "Integration Disabled" : "Integration Enabled",
      description: `${updatedIntegration.name} has been ${updatedIntegration.enabled ? 'disabled' : 'enabled'}`,
    });
  };

  const connectIntegration = (id: string) => {
    setShowApiKeyForm(id);
  };

  const saveApiKey = async (integrationId: string) => {
    if (integrationId === 'git') {
      await connectRepository();
    } else if (integrationId === 'jira') {
      await handleJiraConnection();
    } else if (integrationId === 'azure-devops') {
      await handleAzureDevOpsConnection();
    } else if (integrationId === 'openai') {
      await handleOpenAIConnection();
    } else if (integrationId === 'browserbase') {
      await handleBrowserbaseConnection();
    } else {
      const apiKey = apiKeys[integrationId];
      if (!apiKey) {
        toast({
          title: "Error",
          description: "Please enter an API key",
          variant: "destructive",
        });
        return;
      }

      const currentTime = new Date().toLocaleString();
      try {
        await saveConfigurations(integrationId, { apiKey }, projectId, true);
        
        // Update local state
        setSavedConfigs(prev => ({
          ...prev,
          [integrationId]: { apiKey, lastSync: currentTime, enabled: true }
        }));

        setIntegrations(prev => prev.map(integration => 
          integration.id === integrationId 
            ? { ...integration, status: 'connected', lastSync: currentTime }
            : integration
        ));

        setShowApiKeyForm(null);
        setApiKeys(prev => ({ ...prev, [integrationId]: '' }));
        
        toast({
          title: "Integration Connected",
          description: `${integrations.find(i => i.id === integrationId)?.name} has been connected successfully`,
        });
      } catch (error) {
        console.error('Error saving integration config:', error);
        toast({
          title: "Error",
          description: "Failed to save integration configuration",
          variant: "destructive",
        });
      }
    }
  };

  // Git repository functions
  const fetchGitConfig = async () => {
    try {
      const { data, error } = await supabase
        .from("projects")
        .select("git_repository_url, git_branch, git_sync_status, git_last_sync")
        .eq("id", projectId)
        .single();

      if (error) throw error;
      if (data) {
        setGitConfig(data);
        setRepoUrl(data.git_repository_url || "");
        setBranch(data.git_branch || "main");
        
        // Update integration status
        setIntegrations(prev => prev.map(integration => 
          integration.id === 'git' 
            ? { 
                ...integration, 
                status: data.git_repository_url ? 'connected' : 'disconnected',
                lastSync: data.git_last_sync ? new Date(data.git_last_sync).toLocaleString() : undefined
              }
            : integration
        ));
      }
    } catch (error) {
      console.error("Error fetching git config:", error);
      toast({
        title: "Error",
        description: "Failed to load git configuration",
        variant: "destructive",
      });
    } finally {
      setGitLoading(false);
    }
  };

  const connectRepository = async () => {
    if (!repoUrl) {
      toast({
        title: "Error",
        description: "Please enter a repository URL",
        variant: "destructive",
      });
      return;
    }

    const urlValidation = validateUrl(repoUrl);
    if (!urlValidation.isValid) {
      toast({
        title: "Invalid URL",
        description: urlValidation.error,
        variant: "destructive",
      });
      return;
    }

    if (!accessToken) {
      toast({
        title: "Error",
        description: "Please enter a GitHub access token",
        variant: "destructive",
      });
      return;
    }

    setGitConnecting(true);

    try {
      // Call edge function to validate and connect repository
      const { data, error } = await supabase.functions.invoke("github-connect", {
        body: {
          projectId,
          repositoryUrl: repoUrl,
          accessToken,
          branch,
        },
      });

      if (error) throw error;

      // Update project with git configuration
      const { error: updateError } = await supabase
        .from("projects")
        .update({
          git_repository_url: repoUrl,
          git_branch: branch,
          git_sync_status: "connected",
          git_last_sync: new Date().toISOString(),
        })
        .eq("id", projectId);

      if (updateError) throw updateError;

      setGitConfig({
        git_repository_url: repoUrl,
        git_branch: branch,
        git_sync_status: "connected",
        git_last_sync: new Date().toISOString(),
      });

      setAccessToken(""); // Clear token from state for security
      setShowApiKeyForm(null);

      // Update integration status
      setIntegrations(prev => prev.map(integration => 
        integration.id === 'git' 
          ? { 
              ...integration, 
              status: 'connected',
              lastSync: new Date().toLocaleString()
            }
          : integration
      ));

      toast({
        title: "Success",
        description: "Repository connected successfully",
      });
    } catch (error: any) {
      console.error("Error connecting repository:", error);
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to connect repository",
        variant: "destructive",
      });
    } finally {
      setGitConnecting(false);
    }
  };

  const disconnectRepository = async () => {
    try {
      const { error } = await supabase
        .from("projects")
        .update({
          git_repository_url: null,
          git_branch: null,
          git_sync_status: "disconnected",
          git_last_sync: null,
        })
        .eq("id", projectId);

      if (error) throw error;

      setGitConfig({});
      setRepoUrl("");
      setBranch("main");

      // Update integration status
      setIntegrations(prev => prev.map(integration => 
        integration.id === 'git' 
          ? { 
              ...integration, 
              status: 'disconnected',
              lastSync: undefined
            }
          : integration
      ));

      toast({
        title: "Success",
        description: "Repository disconnected",
      });
    } catch (error) {
      console.error("Error disconnecting repository:", error);
      toast({
        title: "Error",
        description: "Failed to disconnect repository",
        variant: "destructive",
      });
    }
  };

  const getSyncStatusBadge = (status?: string) => {
    switch (status) {
      case "connected":
        return <Badge variant="default" className="bg-green-500"><Check className="w-3 h-3 mr-1" />Connected</Badge>;
      case "error":
        return <Badge variant="destructive"><X className="w-3 h-3 mr-1" />Error</Badge>;
      case "syncing":
        return <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Syncing</Badge>;
      default:
        return <Badge variant="outline">Disconnected</Badge>;
    }
  };

  const handleOpenAIConnection = async () => {
    const { endpoint, apiKey, deploymentId, apiVersion } = openAiConfig;

    // Input validation
    if (!apiKey) {
      toast({
        title: "Error",
        description: "Please enter your API key",
        variant: "destructive",
      });
      return;
    }

    if (!endpoint) {
      toast({
        title: "Error",
        description: "Please enter your Azure OpenAI endpoint",
        variant: "destructive",
      });
      return;
    }

    if (!deploymentId) {
      toast({
        title: "Error",
        description: "Please enter your deployment ID",
        variant: "destructive",
      });
      return;
    }

    // Validate endpoint URL
    const urlValidation = validateUrl(endpoint);
    if (!urlValidation.isValid) {
      toast({
        title: "Error",
        description: urlValidation.error,
        variant: "destructive",
      });
      return;
    }

    // Test the Azure OpenAI connection
    setIsLoading(true);
    try {
      const testUrl = `${endpoint.replace(/\/$/, '')}/openai/deployments/${deploymentId}/chat/completions?api-version=${apiVersion}`;
      
      const response = await fetch(testUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 5
        }),
      });

      if (response.ok || response.status === 400) { // 400 is expected for minimal test
        // Save configuration
        const currentTime = new Date().toLocaleString();
        try {
          await saveConfigurations('openai', openAiConfig, projectId, true);
          
          // Update local state
          setSavedConfigs(prev => ({
            ...prev,
            openai: { ...openAiConfig, enabled: true, lastSync: currentTime }
          }));

          setIntegrations(prev => prev.map(integration => 
            integration.id === 'openai' 
              ? { ...integration, status: 'connected', lastSync: currentTime }
              : integration
          ));
          setShowApiKeyForm(null);
          
          toast({
            title: "OpenAI Connected",
            description: "Azure OpenAI integration has been configured successfully",
          });
        } catch (error) {
          console.error('Error saving OpenAI config:', error);
          toast({
            title: "Error",
            description: "Failed to save OpenAI configuration",
            variant: "destructive",
          });
        }
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error: any) {
      console.error("Error testing OpenAI connection:", error);
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to connect to Azure OpenAI. Please check your configuration.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBrowserbaseConnection = async () => {
    const { apiKey, projectId: bbProjectId } = browserbaseConfig;

    // Input validation
    if (!apiKey) {
      toast({
        title: "Error",
        description: "Please enter your Browserbase API key",
        variant: "destructive",
      });
      return;
    }

    if (!bbProjectId) {
      toast({
        title: "Error",
        description: "Please enter your Browserbase Project ID",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Save configuration without testing (Browserbase doesn't have a simple test endpoint)
      const currentTime = new Date().toLocaleString();
      await saveConfigurations('browserbase', browserbaseConfig, projectId, true);
      
      // Update local state
      setSavedConfigs(prev => ({
        ...prev,
        browserbase: { ...browserbaseConfig, enabled: true, lastSync: currentTime }
      }));

      setIntegrations(prev => prev.map(integration => 
        integration.id === 'browserbase' 
          ? { ...integration, status: 'connected', lastSync: currentTime }
          : integration
      ));
      setShowApiKeyForm(null);
      
      toast({
        title: "Browserbase Connected",
        description: "Browserbase integration has been configured successfully",
      });
    } catch (error: any) {
      console.error('Error saving Browserbase config:', error);
      toast({
        title: "Error",
        description: "Failed to save Browserbase configuration",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleJiraConnection = async () => {
    const { url, email, projectKey } = jiraConfig;
    const apiToken = apiKeys['jira'];

    // Input validation
    if (!url || !email || !projectKey || !apiToken) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    // URL validation
    const urlValidation = validateUrl(url);
    if (!urlValidation.isValid) {
      toast({
        title: "Error",
        description: urlValidation.error,
        variant: "destructive",
      });
      return;
    }

    // Email validation
    const emailValidation = validateEmail(email);
    if (!emailValidation.isValid) {
      toast({
        title: "Error",
        description: emailValidation.error,
        variant: "destructive",
      });
      return;
    }

    // Project key validation
    const projectKeyValidation = validateProjectKey(projectKey);
    if (!projectKeyValidation.isValid) {
      toast({
        title: "Error",
        description: projectKeyValidation.error,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("jira-integration", {
        body: {
          jiraUrl: sanitizeText(url),
          email: sanitizeText(email),
          apiToken,
          projectKey: sanitizeText(projectKey.toUpperCase())
        },
      });

      if (error) throw error;

      if (data.success) {
        // Save configuration
        const currentTime = new Date().toLocaleString();
        try {
          await saveConfigurations('jira', { ...jiraConfig, apiToken }, projectId, true);
          
          // Update local state
          setSavedConfigs(prev => ({
            ...prev,
            jira: { ...jiraConfig, apiToken, enabled: true, lastSync: currentTime }
          }));

          setJiraStories(data.stories);
          setIntegrations(prev => prev.map(integration => 
            integration.id === 'jira' 
              ? { ...integration, status: 'connected', lastSync: currentTime }
              : integration
          ));
          setShowApiKeyForm(null);
          
          toast({
            title: "Jira Connected",
            description: "Jira integration has been configured successfully",
          });
        } catch (error) {
          console.error('Error saving Jira config:', error);
          toast({
            title: "Error",
            description: "Failed to save Jira configuration",
            variant: "destructive",
          });
        }
      } else {
        throw new Error(data.error || 'Connection failed');
      }
    } catch (error: any) {
      console.error("Error connecting to Jira:", error);
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to connect to Jira. Please check your credentials and configuration.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAzureDevOpsConnection = async () => {
    const { organizationUrl, projectName } = azureDevOpsConfig;
    const personalAccessToken = apiKeys['azure-devops'];

    // Input validation
    if (!organizationUrl || !projectName || !personalAccessToken) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    // URL validation
    const urlValidation = validateUrl(organizationUrl);
    if (!urlValidation.isValid) {
      toast({
        title: "Error",
        description: urlValidation.error,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Test connection by fetching boards instead of user stories
      const { data, error } = await supabase.functions.invoke("azure-devops-integration", {
        body: {
          organizationUrl: sanitizeText(organizationUrl),
          projectName: sanitizeText(projectName),
          personalAccessToken,
          action: 'get-boards'
        },
      });

      if (error) throw error;

      if (data.success) {
        // Save configuration
        const currentTime = new Date().toLocaleString();
        try {
          await saveConfigurations('azure-devops', { ...azureDevOpsConfig, personalAccessToken }, projectId, true);
          
          // Update local state
          setSavedConfigs(prev => ({
            ...prev,
            'azure-devops': { ...azureDevOpsConfig, personalAccessToken, enabled: true, lastSync: currentTime }
          }));

          // Don't set user stories during configuration - only set boards for future use
          setIntegrations(prev => prev.map(integration => 
            integration.id === 'azure-devops' 
              ? { ...integration, status: 'connected', lastSync: currentTime }
              : integration
          ));
          setShowApiKeyForm(null);
          
          toast({
            title: "Azure DevOps Connected",
            description: `Connection successful! Found ${data.boards?.length || 0} team(s) in the project.`,
          });
        } catch (error) {
          console.error('Error saving Azure DevOps config:', error);
          toast({
            title: "Error",
            description: "Failed to save Azure DevOps configuration",
            variant: "destructive",
          });
        }
      } else {
        throw new Error(data.error || 'Connection failed');
      }
    } catch (error: any) {
      console.error("Error connecting to Azure DevOps:", error);
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to connect to Azure DevOps. Please check your credentials and configuration.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const generateTestCases = async () => {
    const allStories = [...jiraStories, ...azureDevOpsStories];
    if (allStories.length === 0) {
      toast({
        title: "No Stories Found",
        description: "Please import user stories from Jira or Azure DevOps first",
        variant: "destructive",
      });
      return;
    }

    const openAiIntegration = integrations.find(i => i.id === 'openai');
    if (!openAiIntegration || openAiIntegration.status !== 'connected') {
      toast({
        title: "OpenAI Not Connected",
        description: "Please connect Azure OpenAI first to generate test cases",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-test-cases", {
        body: {
          stories: allStories,
          projectId,
          openAiConfig: savedConfigs.openai
        },
      });

      if (error) throw error;

      setGeneratedTestCases(data.testCases || []);
      toast({
        title: "Test Cases Generated",
        description: `Generated ${data.testCases?.length || 0} test cases successfully`,
      });
    } catch (error: any) {
      console.error("Error generating test cases:", error);
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate test cases",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };


  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Settings className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
        return 'bg-green-100 text-green-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Integrations</h2>
          <p className="text-muted-foreground">
            Connect external tools and services to enhance your testing workflow
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {integrations.map((integration) => {
          const IconComponent = integration.icon;
          return (
            <Card key={integration.id} className="relative">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center space-x-2">
                  <IconComponent className="h-5 w-5" />
                  <CardTitle className="text-lg">{integration.name}</CardTitle>
                </div>
                <div className="flex items-center space-x-2">
                  {getStatusIcon(integration.status)}
                  <Switch
                    checked={integration.enabled}
                    onCheckedChange={() => toggleIntegration(integration.id)}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="mb-4">
                  {integration.description}
                </CardDescription>
                
                <div className="flex items-center justify-between mb-4">
                  <Badge className={getStatusColor(integration.status)}>
                    {integration.status}
                  </Badge>
                  {integration.lastSync && (
                    <span className="text-xs text-muted-foreground">
                      Last sync: {integration.lastSync}
                    </span>
                  )}
                </div>

                {integration.enabled && (
                  <div className="space-y-2">
                    {integration.status === 'disconnected' ? (
                      <Button
                        onClick={() => connectIntegration(integration.id)}
                        className="w-full"
                        size="sm"
                      >
                        <Key className="h-4 w-4 mr-2" />
                        Connect
                      </Button>
                    ) : (
                      <div className="space-y-2">
                        <Button
                          onClick={() => connectIntegration(integration.id)}
                          variant="outline"
                          className="w-full"
                          size="sm"
                        >
                          <Settings className="h-4 w-4 mr-2" />
                          Configure
                        </Button>
                        {integration.id === 'git' && integration.status === 'connected' && (
                          <Button
                            onClick={disconnectRepository}
                            variant="destructive"
                            className="w-full"
                            size="sm"
                          >
                            Disconnect
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* API Key Configuration Form */}
      {showApiKeyForm && (
        <Card>
          <CardHeader>
            <CardTitle>Configure {integrations.find(i => i.id === showApiKeyForm)?.name}</CardTitle>
            <CardDescription>
              Enter the required information to connect this integration
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {showApiKeyForm === 'git' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="repoUrl">Repository URL</Label>
                  <Input
                    id="repoUrl"
                    placeholder="https://github.com/username/repository"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="branch">Branch</Label>
                  <Input
                    id="branch"
                    placeholder="main"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accessToken">GitHub Access Token</Label>
                  <Input
                    id="accessToken"
                    type="password"
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                  />
                </div>
                {gitConfig.git_repository_url && (
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Current Repository</p>
                        <p className="text-sm text-muted-foreground">{gitConfig.git_repository_url}</p>
                        <p className="text-sm text-muted-foreground">Branch: {gitConfig.git_branch}</p>
                      </div>
                      {getSyncStatusBadge(gitConfig.git_sync_status)}
                    </div>
                  </div>
                )}
              </>
            )}

            {showApiKeyForm === 'jira' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="jiraUrl">Jira URL</Label>
                  <Input
                    id="jiraUrl"
                    placeholder="https://your-domain.atlassian.net"
                    value={jiraConfig.url}
                    onChange={(e) => setJiraConfig(prev => ({ ...prev, url: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="jiraEmail">Email</Label>
                  <Input
                    id="jiraEmail"
                    type="email"
                    placeholder="your-email@example.com"
                    value={jiraConfig.email}
                    onChange={(e) => setJiraConfig(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="jiraProjectKey">Project Key</Label>
                  <Input
                    id="jiraProjectKey"
                    placeholder="PROJ"
                    value={jiraConfig.projectKey}
                    onChange={(e) => setJiraConfig(prev => ({ ...prev, projectKey: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="jiraApiToken">API Token</Label>
                  <Input
                    id="jiraApiToken"
                    type="password"
                    placeholder="Your Jira API token"
                    value={apiKeys['jira'] || ''}
                    onChange={(e) => setApiKeys(prev => ({ ...prev, jira: e.target.value }))}
                  />
                </div>
              </>
            )}

            {showApiKeyForm === 'azure-devops' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="azureOrgUrl">Organization URL</Label>
                  <Input
                    id="azureOrgUrl"
                    placeholder="https://dev.azure.com/yourorganization"
                    value={azureDevOpsConfig.organizationUrl}
                    onChange={(e) => setAzureDevOpsConfig(prev => ({ ...prev, organizationUrl: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="azureProjectName">Project Name</Label>
                  <Input
                    id="azureProjectName"
                    placeholder="Your project name"
                    value={azureDevOpsConfig.projectName}
                    onChange={(e) => setAzureDevOpsConfig(prev => ({ ...prev, projectName: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="azurePersonalAccessToken">Personal Access Token</Label>
                  <Input
                    id="azurePersonalAccessToken"
                    type="password"
                    placeholder="Your Azure DevOps PAT"
                    value={apiKeys['azure-devops'] || ''}
                    onChange={(e) => setApiKeys(prev => ({ ...prev, 'azure-devops': e.target.value }))}
                  />
                </div>
              </>
            )}

            {showApiKeyForm === 'openai' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="openaiEndpoint">Azure OpenAI Endpoint</Label>
                  <Input
                    id="openaiEndpoint"
                    placeholder="https://your-resource.openai.azure.com"
                    value={openAiConfig.endpoint}
                    onChange={(e) => setOpenAiConfig(prev => ({ ...prev, endpoint: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="openaiApiKey">API Key</Label>
                  <Input
                    id="openaiApiKey"
                    type="password"
                    placeholder="Your Azure OpenAI API key"
                    value={openAiConfig.apiKey}
                    onChange={(e) => setOpenAiConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="openaiDeploymentId">Deployment ID</Label>
                  <Input
                    id="openaiDeploymentId"
                    placeholder="gpt-35-turbo"
                    value={openAiConfig.deploymentId}
                    onChange={(e) => setOpenAiConfig(prev => ({ ...prev, deploymentId: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="openaiApiVersion">API Version</Label>
                  <Input
                    id="openaiApiVersion"
                    placeholder="2024-02-15-preview"
                    value={openAiConfig.apiVersion}
                    onChange={(e) => setOpenAiConfig(prev => ({ ...prev, apiVersion: e.target.value }))}
                  />
                </div>
              </>
            )}

            {showApiKeyForm === 'browserbase' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="browserbaseApiKey">API Key</Label>
                  <Input
                    id="browserbaseApiKey"
                    type="password"
                    placeholder="Your Browserbase API key"
                    value={browserbaseConfig.apiKey}
                    onChange={(e) => setBrowserbaseConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Get your API key from <a href="https://www.browserbase.com/settings" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Browserbase Settings</a>
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="browserbaseProjectId">Project ID</Label>
                  <Input
                    id="browserbaseProjectId"
                    placeholder="Your Browserbase Project ID"
                    value={browserbaseConfig.projectId}
                    onChange={(e) => setBrowserbaseConfig(prev => ({ ...prev, projectId: e.target.value }))}
                  />
                </div>
              </>
            )}

            {showApiKeyForm !== 'git' && showApiKeyForm !== 'jira' && showApiKeyForm !== 'azure-devops' && showApiKeyForm !== 'openai' && showApiKeyForm !== 'browserbase' && (
              <div className="space-y-2">
                <Label htmlFor="apiKey">API Key</Label>
                <Input
                  id="apiKey"
                  type="password"
                  placeholder="Enter your API key"
                  value={apiKeys[showApiKeyForm] || ''}
                  onChange={(e) => setApiKeys(prev => ({ ...prev, [showApiKeyForm]: e.target.value }))}
                />
              </div>
            )}

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowApiKeyForm(null)}>
                Cancel
              </Button>
              <Button onClick={() => saveApiKey(showApiKeyForm)} disabled={isLoading || gitConnecting}>
                {isLoading || gitConnecting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {showApiKeyForm === 'git' ? 'Connecting...' : 'Connecting...'}
                  </>
                ) : (
                  'Connect'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}


      {/* Imported Stories Section */}
      {jiraStories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Imported Stories</span>
              <Button onClick={generateTestCases} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-2" />
                    Generate Test Cases
                  </>
                )}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {jiraStories.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Jira Stories ({jiraStories.length})</h4>
                  <div className="grid gap-2">
                    {jiraStories.map((story, index) => (
                      <div key={index} className="p-3 border rounded-lg">
                        <h5 className="font-medium">{story.key}: {story.summary}</h5>
                        <p className="text-sm text-muted-foreground mt-1">
                          {extractTextFromJiraContent(story.description)}
                        </p>
                        <div className="flex items-center mt-2 space-x-2">
                          <Badge variant="outline">{story.issueType}</Badge>
                          <Badge variant="outline">{story.status}</Badge>
                          {story.priority && <Badge variant="outline">Priority: {story.priority}</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </CardContent>
        </Card>
      )}

      {/* Generated Test Cases Section */}
      {generatedTestCases.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Generated Test Cases ({generatedTestCases.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              {generatedTestCases.map((testCase, index) => (
                <div key={index} className="p-4 border rounded-lg">
                  <h5 className="font-medium">{testCase.title}</h5>
                  <p className="text-sm text-muted-foreground mt-1">{testCase.description}</p>
                  <div className="mt-2">
                    <h6 className="text-sm font-medium">Test Steps:</h6>
                    <ol className="text-sm text-muted-foreground mt-1 list-decimal list-inside">
                      {testCase.steps?.map((step: string, stepIndex: number) => (
                        <li key={stepIndex}>{step}</li>
                      ))}
                    </ol>
                  </div>
                  <div className="mt-2">
                    <h6 className="text-sm font-medium">Expected Result:</h6>
                    <p className="text-sm text-muted-foreground">{testCase.expectedResult}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};