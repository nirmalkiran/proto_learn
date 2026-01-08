import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useRoles } from "@/hooks/useRoles";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Save } from "lucide-react";

interface MenuConfigItem {
  id: string;
  menu_id: string;
  label: string;
  is_visible: boolean;
  display_order: number;
}

const DEFAULT_MENU_ITEMS: MenuConfigItem[] = [
  { id: "1", menu_id: "dashboard", label: "Dashboard", is_visible: true, display_order: 1 },
  { id: "2", menu_id: "test-plan", label: "Test Plan", is_visible: true, display_order: 2 },
  { id: "3", menu_id: "user-stories", label: "User Stories", is_visible: true, display_order: 3 },
  { id: "4", menu_id: "test-cases", label: "Test Cases", is_visible: true, display_order: 4 },
  { id: "5", menu_id: "repository", label: "Repository", is_visible: true, display_order: 5 },
  { id: "6", menu_id: "api", label: "API Testing", is_visible: true, display_order: 6 },
  { id: "7", menu_id: "nocode-automation", label: "No-Code Automation", is_visible: true, display_order: 7 },
  { id: "8", menu_id: "mobile-no-code-automation", label: "Mobile Automation", is_visible: true, display_order: 8 },
  { id: "9", menu_id: "test-report", label: "Test Report", is_visible: true, display_order: 9 },
  { id: "10", menu_id: "integrations", label: "Integrations", is_visible: true, display_order: 10 },
  { id: "11", menu_id: "self-hosting", label: "Self Hosting", is_visible: true, display_order: 11 },
];

export const MenuConfigPanel = () => {
  const { toast } = useToast();
  const { isAdmin, loading: roleLoading } = useRoles();
  const [menuItems, setMenuItems] = useState<MenuConfigItem[]>(() => {
    const saved = localStorage.getItem('menu_config');
    return saved ? JSON.parse(saved) : DEFAULT_MENU_ITEMS;
  });
  const [saving, setSaving] = useState(false);

  const handleToggle = (menuId: string, isVisible: boolean) => {
    setMenuItems(items =>
      items.map(item =>
        item.menu_id === menuId ? { ...item, is_visible: isVisible } : item
      )
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      localStorage.setItem('menu_config', JSON.stringify(menuItems));
      toast({
        title: "Success",
        description: "Menu configuration saved successfully",
      });
    } catch (error: any) {
      console.error('Error saving menu config:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save menu configuration",
      });
    } finally {
      setSaving(false);
    }
  };

  if (roleLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-center">
            You need admin privileges to access this panel.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Menu Configuration</CardTitle>
        <CardDescription>
          Configure which menu items are visible in the sidebar
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {menuItems.map((item) => (
            <div key={item.id} className="flex items-center justify-between py-3 border-b last:border-0">
              <Label htmlFor={item.menu_id} className="text-base font-medium cursor-pointer">
                {item.label}
              </Label>
              <Switch
                id={item.menu_id}
                checked={item.is_visible}
                onCheckedChange={(checked) => handleToggle(item.menu_id, checked)}
              />
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
