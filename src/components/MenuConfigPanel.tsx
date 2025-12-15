import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
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

export const MenuConfigPanel = () => {
  const { toast } = useToast();
  const { isAdmin, loading: roleLoading } = useRoles();
  const [menuItems, setMenuItems] = useState<MenuConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchMenuConfig();
  }, []);

  const fetchMenuConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('menu_config')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;
      setMenuItems(data || []);
    } catch (error: any) {
      console.error('Error fetching menu config:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load menu configuration",
      });
    } finally {
      setLoading(false);
    }
  };

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
      const updates = menuItems.map(item => ({
        id: item.id,
        is_visible: item.is_visible,
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from('menu_config')
          .update({ is_visible: update.is_visible })
          .eq('id', update.id);

        if (error) throw error;
      }

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

  if (roleLoading || loading) {
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
