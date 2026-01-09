import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Dashboard } from "@/components/Dashboard";
import { UserStories } from "@/components/UserStories";
import { TestCases } from "@/components/TestCases";
import { TestPlan } from "@/components/TestPlan";
import { TestReport } from "@/components/TestReport";
import { Integrations } from "@/components/Integrations";
import { Repository } from "@/components/Repository";
import { AIAnalytics } from "@/components/AIAnalytics";
import { QAInsights } from "@/components/QAInsights";
import RoleManager from "@/components/RoleManager";
import { Automation } from "@/components/Automation";
import { KnowledgeBase } from "@/components/KnowledgeBase";
import { Defects } from "@/components/Defects";
import { SwaggerTestGenerator } from "@/components/SwaggerTestGenerator";
import { EnhancedPerformanceTestGenerator } from "@/components/EnhancedPerformanceTestGenerator";
import { NoCodeAutomation } from "@/components/NoCodeAutomation";
import { AgentManagement } from "@/components/AgentManagement";
import { AIGovernance } from "@/components/AIGovernance";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import MobileAutomation from "@/modules/mobileAutomation";

const Project = () => {
  const { projectId, view } = useParams<{ projectId: string; view?: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentView, setCurrentView] = useState(view || 'dashboard');
  const [selectedProject, setSelectedProject] = useState<{ id: string; name: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (view) {
      setCurrentView(view);
    }
  }, [view]);

  useEffect(() => {
    const loadProject = async () => {
      if (!projectId) {
        navigate('/');
        return;
      }

      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('projects')
          .select('id, name')
          .eq('id', projectId)
          .single();

        if (error) throw error;

        if (data) {
          setSelectedProject({ id: data.id, name: data.name });
        } else {
          toast({
            title: "Project not found",
            description: "The requested project does not exist",
            variant: "destructive",
          });
          navigate('/');
        }
      } catch (error) {
        console.error('Error loading project:', error);
        toast({
          title: "Error",
          description: "Failed to load project",
          variant: "destructive",
        });
        navigate('/');
      } finally {
        setIsLoading(false);
      }
    };

    loadProject();
  }, [projectId, navigate, toast]);

  const handleBackToProjects = () => {
    navigate('/');
  };

  const handleViewChange = (newView: string) => {
    setCurrentView(newView);
    if (projectId) {
      navigate(`/project/${projectId}/${newView}`);
    }
  };

  const renderView = () => {
    if (!selectedProject) return null;

    switch (currentView) {
      case 'dashboard':
        return <Dashboard onViewChange={setCurrentView} projectId={selectedProject.id} />;
      case 'user-stories':
        return <UserStories onViewChange={setCurrentView} projectId={selectedProject.id} />;
      case 'test-cases':
        return <TestCases projectId={selectedProject.id} />;
      case 'test-plan':
        return <TestPlan projectId={selectedProject.id} />;
      case 'test-report':
        return <TestReport projectId={selectedProject.id} />;
      case 'integrations':
        return <Integrations projectId={selectedProject.id} />;
      case 'automation':
        return <Automation projectId={selectedProject.id} />;
      case 'repository':
        return <Repository projectId={selectedProject.id} />;
      case 'defects':
        return <Defects onViewChange={setCurrentView} projectId={selectedProject.id} />;
      case 'api':
        return <SwaggerTestGenerator projectId={selectedProject.id} />;
      case 'performance':
        return <EnhancedPerformanceTestGenerator />;
      case 'nocode-automation':
        return <NoCodeAutomation projectId={selectedProject.id} />;
      case "mobile-no-code-automation":
         return <MobileAutomation />;
      case "performance-testing":
         return <EnhancedPerformanceTestGenerator />;
      case "agents":
         return <AgentManagement projectId={selectedProject.id} />;
      case "ai-governance":
         return <AIGovernance projectId={selectedProject.id} />;
      default:
        return <Dashboard onViewChange={setCurrentView} projectId={selectedProject.id} />;
    }
  };

  if (isLoading) {
    return (
      <Layout 
        currentView={currentView} 
        onViewChange={handleViewChange}
        selectedProject={selectedProject}
        onBackToProjects={handleBackToProjects}
      >
        <div className="space-y-6">
          <Skeleton className="h-12 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-32" />
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout 
      currentView={currentView} 
      onViewChange={handleViewChange}
      selectedProject={selectedProject}
      onBackToProjects={handleBackToProjects}
    >
      {renderView()}
    </Layout>
  );
};

export default Project;
