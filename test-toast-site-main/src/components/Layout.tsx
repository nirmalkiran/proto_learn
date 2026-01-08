import { useState, useEffect } from "react";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Settings, ArrowLeft, FolderOpen, BarChart3, Brain, Users, Menu, BookOpen, Server } from "lucide-react";
import { useRoles } from "@/hooks/useRoles";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";

interface LayoutProps {
  children: React.ReactNode;
  currentView: string;
  onViewChange: (view: string) => void;
  selectedProject?: { id: string; name: string } | null;
  onBackToProjects?: () => void;
}

const AppSidebar = ({
  currentView,
  onViewChange,
  selectedProject,
  onBackToProjects,
}: {
  currentView: string;
  onViewChange: (view: string) => void;
  selectedProject?: { id: string; name: string } | null;
  onBackToProjects?: () => void;
}) => {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const { isAdmin } = useRoles();
  const [menuConfig, setMenuConfig] = useState<{ menuId: string; order: number }[]>([]);
  const [userStoriesCount, setUserStoriesCount] = useState<number>(0);
  const [defectsCount, setDefectsCount] = useState<number>(0);
  const [testPlansCount, setTestPlansCount] = useState<number>(0);
  const [testCasesCount, setTestCasesCount] = useState<number>(0);
  const [testingOnlyMode, setTestingOnlyMode] = useState(false);

  useEffect(() => {
    fetchMenuConfig();
    fetchTestingOnlyMode();
  }, []);

  const fetchTestingOnlyMode = async () => {
    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select("setting_value")
        .eq("setting_key", "testing_only_mode")
        .single();

      if (error && error.code !== "PGRST116") throw error;
      const settingValue = data?.setting_value as { enabled?: boolean } | null;
      setTestingOnlyMode(settingValue?.enabled || false);
    } catch (error: any) {
      console.error("Error fetching testing only mode:", error);
    }
  };

  useEffect(() => {
    if (selectedProject?.id) {
      fetchCounts(selectedProject.id);
    }
  }, [selectedProject?.id]);

  const fetchCounts = async (projectId: string) => {
    try {
      // Fetch all counts in parallel
      const [storiesResult, defectsResult, plansResult, casesResult] = await Promise.all([
        supabase.from("user_stories").select("*", { count: "exact", head: true }).eq("project_id", projectId),
        supabase
          .from("test_cases")
          .select("*", { count: "exact", head: true })
          .eq("project_id", projectId)
          .eq("status", "failed"),
        supabase.from("saved_test_plans").select("*", { count: "exact", head: true }).eq("project_id", projectId),
        supabase.from("test_cases").select("*", { count: "exact", head: true }).eq("project_id", projectId),
      ]);

      setUserStoriesCount(storiesResult.count || 0);
      setDefectsCount(defectsResult.count || 0);
      setTestPlansCount(plansResult.count || 0);
      setTestCasesCount(casesResult.count || 0);
    } catch (error) {
      console.error("Error fetching counts:", error);
    }
  };

  const fetchMenuConfig = async () => {
    try {
      const { data, error } = await supabase
        .from("menu_config")
        .select("menu_id, is_visible, display_order")
        .eq("is_visible", true)
        .order("display_order", { ascending: true });

      if (error) throw error;

      const config = data?.map((item) => ({ menuId: item.menu_id, order: item.display_order })) || [];
      setMenuConfig(config);
    } catch (error) {
      console.error("Error fetching menu config:", error);
      // Fallback: show all items if fetch fails
      setMenuConfig([
        { menuId: "dashboard", order: 1 },
        { menuId: "test-plan", order: 2 },
        { menuId: "user-stories", order: 3 },
        { menuId: "test-cases", order: 4 },
        { menuId: "repository", order: 5 },
        { menuId: "api", order: 6 },
        { menuId: "nocode-automation", order: 7 },
        { menuId: "agents", order: 8 },
        { menuId: "defects", order: 9 },
        { menuId: "test-report", order: 10 },
        { menuId: "integrations", order: 11 },
        { menuId: "ai-governance", order: 12 },
      ]);
    }
  };

  const allSdlcPhases = [
    {
      id: "monitoring",
      label: "MONITORING",
      items: [{ id: "maintenance-issues", label: "Maintenance Issues", count: 5 }],
    },
    {
      id: "requirements",
      label: "REQUIREMENT",
      items: [
        { id: "requirement-dashboard", label: "Requirement Dashboard" },
        { id: "requirement-analysis", label: "Requirement Analysis", count: 1 },
        { id: "user-story", label: "User Story", count: 5 },
      ],
    },
    {
      id: "design",
      label: "DESIGN",
      items: [
        { id: "design-dashboard", label: "Design Dashboard" },
        { id: "architecture", label: "Architecture" },
        { id: "ui-ux-wireframes", label: "UI/UX Wireframes" },
        { id: "api-contracts", label: "API Contracts" },
        { id: "data-model", label: "Data Model" },
      ],
    },
    {
      id: "development",
      label: "DEVELOPMENT",
      items: [
        { id: "development-dashboard", label: "Development Dashboard" },
        { id: "feature-implementation", label: "Feature Implementation" },
        { id: "explain-code", label: "Explain Code" },
        { id: "unit-test-cases", label: "Unit Test Cases" },
        { id: "peer-review", label: "Peer Review" },
      ],
    },
    {
      id: "testing",
      label: "TESTING",
      items: (() => {
        const visibleMenuIds = new Set(menuConfig.map((c) => c.menuId));
        const allItems = [
          { id: "dashboard", label: "Testing Dashboard" },
          { id: "user-stories", label: "User Stories", count: userStoriesCount || undefined },
          { id: "test-plan", label: "Test Plans", count: testPlansCount || undefined },
          { id: "test-cases", label: "Test Case", count: testCasesCount || undefined },
          { id: "repository", label: "Automation Testing (Selenium)" },
          { id: "api", label: "API Testing" },
          { id: "performance-testing", label: "Performance Testing" },
          { id: "nocode-automation", label: "Automation Testing (No-code)" },
          { id: "agents", label: "Self-Hosted Agents" },
          { id: "defects", label: "Defects", count: defectsCount || undefined },
          { id: "test-report", label: "Test Report" },
          { id: "integrations", label: "Integrations" },
          { id: "ai-governance", label: "AI Governance" },
        ];
        const filtered = allItems.filter((item) => menuConfig.length === 0 || visibleMenuIds.has(item.id));
        // Sort by display_order from menuConfig
        const orderMap = new Map(menuConfig.map((c) => [c.menuId, c.order]));
        return filtered.sort((a, b) => (orderMap.get(a.id) || 999) - (orderMap.get(b.id) || 999));
      })(),
    },
    {
      id: "deployment",
      label: "DEPLOYMENT",
      items: [
        { id: "deployment-dashboard", label: "Deployment Dashboard" },
        { id: "cicd-pipeline", label: "CI/CD Pipeline Configurations" },
        { id: "iac", label: "IAC" },
      ],
    },
  ];

  // Filter to only show Testing phase when testingOnlyMode is enabled
  const sdlcPhases = testingOnlyMode ? allSdlcPhases.filter((phase) => phase.id === "testing") : allSdlcPhases;

  const mainNavItems = [
    { id: "projects", label: "Projects", icon: FolderOpen },
    { id: "knowledge-base", label: "Knowledge Base", icon: BookOpen },
    { id: "qa-insights", label: "QA Insights", icon: BarChart3 },
    { id: "ai-analytics", label: "AI Analytics", icon: Brain },
    ...(isAdmin
      ? [
          { id: "role-manager", label: "Role Management", icon: Users },
          { id: "menu-config", label: "Configurations", icon: Settings },
        ]
      : []),
  ];

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="flex flex-col h-full">
        {!isCollapsed && (
          <div className="p-4 flex-shrink-0">
            <h1 className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">TestCraft AI</h1>
            {selectedProject && onBackToProjects && (
              <div className="mt-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onBackToProjects}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {selectedProject.name}
                </Button>
              </div>
            )}
          </div>
        )}

        {isCollapsed && selectedProject && onBackToProjects && (
          <div className="p-2 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBackToProjects}
              className="w-8 h-8 text-muted-foreground hover:text-foreground"
              title="Back to Projects"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {selectedProject ? (
            <>
              {/* SDLC Phases */}
              {sdlcPhases.map((phase) => (
                <SidebarGroup key={phase.id} className="py-2">
                  <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground tracking-wider px-4">
                    {phase.label}
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {phase.items.map((item) => {
                        const isActive = currentView === item.id;
                        const isClickable = phase.id === "testing";
                        return (
                          <SidebarMenuItem key={item.id}>
                            <SidebarMenuButton
                              onClick={isClickable ? () => onViewChange(item.id) : undefined}
                              tooltip={item.label}
                              className={`relative ml-2 pl-4 ${
                                isActive
                                  ? "bg-primary/5 text-foreground font-medium before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-6 before:w-1 before:bg-primary before:rounded-r"
                                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                              }`}
                            >
                              {!isCollapsed && (
                                <div className="flex items-center justify-between w-full">
                                  <span>{item.label}</span>
                                  {item.count !== undefined && (
                                    <span className="text-muted-foreground text-sm">({item.count})</span>
                                  )}
                                </div>
                              )}
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              ))}
            </>
          ) : (
            <SidebarGroup>
              <SidebarGroupLabel>Main Menu</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {mainNavItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentView === item.id;
                    return (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          onClick={() => onViewChange(item.id)}
                          isActive={isActive}
                          tooltip={item.label}
                          className={
                            isActive
                              ? "bg-gradient-to-r from-primary/20 to-accent/20 text-primary border-l-2 border-primary font-medium shadow-sm"
                              : "hover:bg-muted/50"
                          }
                        >
                          <Icon className={`h-4 w-4 ${isActive ? "text-primary" : ""}`} />
                          {!isCollapsed && <span>{item.label}</span>}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </div>
      </SidebarContent>
    </Sidebar>
  );
};

const LayoutContent = ({ children, currentView, onViewChange, selectedProject, onBackToProjects }: LayoutProps) => {
  const { toggleSidebar } = useSidebar();

  return (
    <div className="min-h-screen flex w-full bg-background pt-16">
      <AppSidebar
        currentView={currentView}
        onViewChange={onViewChange}
        selectedProject={selectedProject}
        onBackToProjects={onBackToProjects}
      />
      <div className="flex-1 flex flex-col">
        <div className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
          <div className="h-16 flex items-center px-4 gap-4">
            <Button variant="ghost" size="icon" onClick={toggleSidebar} className="h-8 w-8 z-50">
              <Menu className="h-4 w-4" />
            </Button>
            <div className="flex-1">
              <Header />
            </div>
          </div>
        </div>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
};

export const Layout = ({ children, currentView, onViewChange, selectedProject, onBackToProjects }: LayoutProps) => {
  return (
    <SidebarProvider>
      <LayoutContent
        children={children}
        currentView={currentView}
        onViewChange={onViewChange}
        selectedProject={selectedProject}
        onBackToProjects={onBackToProjects}
      />
    </SidebarProvider>
  );
};
