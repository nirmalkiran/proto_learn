import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useRoles } from "@/hooks/useRoles";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Save, AlertCircle, GripVertical } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface MenuConfigItem {
  id: string;
  menu_id: string;
  label: string;
  is_visible: boolean;
  display_order: number;
}

interface SortableMenuItemProps {
  item: MenuConfigItem;
  onToggle: (menuId: string, isVisible: boolean) => void;
}

const SortableMenuItem = ({ item, onToggle }: SortableMenuItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between py-3 border-b last:border-0 bg-background"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <Label htmlFor={item.menu_id} className="text-base font-medium cursor-pointer">
          {item.label}
        </Label>
      </div>
      <Switch
        id={item.menu_id}
        checked={item.is_visible}
        onCheckedChange={(checked) => onToggle(item.menu_id, checked)}
      />
    </div>
  );
};

export const MenuConfigPanel = () => {
  const { toast } = useToast();
  const { isAdmin, loading: roleLoading } = useRoles();
  const [menuItems, setMenuItems] = useState<MenuConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingOnlyMode, setTestingOnlyMode] = useState(false);
  const [screenshotOnFailureOnly, setScreenshotOnFailureOnly] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    fetchMenuConfig();
    fetchTestingOnlyMode();
    fetchScreenshotSettings();
  }, []);

  const fetchTestingOnlyMode = async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'testing_only_mode')
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      const settingValue = data?.setting_value as { enabled?: boolean } | null;
      setTestingOnlyMode(settingValue?.enabled || false);
    } catch (error: any) {
      console.error('Error fetching testing only mode:', error);
    }
  };

  const handleTestingOnlyModeToggle = async (enabled: boolean) => {
    setTestingOnlyMode(enabled);
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          setting_key: 'testing_only_mode',
          setting_value: { enabled },
          updated_at: new Date().toISOString()
        }, { onConflict: 'setting_key' });

      if (error) throw error;
      
      toast({
        title: "Success",
        description: `Testing Only Mode ${enabled ? 'enabled' : 'disabled'}`,
      });
    } catch (error: any) {
      console.error('Error updating testing only mode:', error);
      setTestingOnlyMode(!enabled); // Revert on error
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update Testing Only Mode",
      });
    }
  };

  const fetchScreenshotSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'screenshot_on_failure_only')
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      const settingValue = data?.setting_value as { enabled?: boolean } | null;
      setScreenshotOnFailureOnly(settingValue?.enabled || false);
    } catch (error: any) {
      console.error('Error fetching screenshot settings:', error);
    }
  };

  const handleScreenshotSettingToggle = async (enabled: boolean) => {
    setScreenshotOnFailureOnly(enabled);
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          setting_key: 'screenshot_on_failure_only',
          setting_value: { enabled },
          updated_at: new Date().toISOString()
        }, { onConflict: 'setting_key' });

      if (error) throw error;
      
      toast({
        title: "Success",
        description: `Screenshot on failure only ${enabled ? 'enabled' : 'disabled'}`,
      });
    } catch (error: any) {
      console.error('Error updating screenshot settings:', error);
      setScreenshotOnFailureOnly(!enabled); // Revert on error
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update screenshot settings",
      });
    }
  };

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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setMenuItems((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        const reordered = arrayMove(items, oldIndex, newIndex);
        // Update display_order for each item
        return reordered.map((item, index) => ({
          ...item,
          display_order: index + 1,
        }));
      });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = menuItems.map(item => ({
        id: item.id,
        is_visible: item.is_visible,
        display_order: item.display_order,
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from('menu_config')
          .update({ is_visible: update.is_visible, display_order: update.display_order })
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
    <div className="space-y-6">
      {/* Testing Only Mode Card */}
      <Card>
        <CardHeader>
          <CardTitle>Display Mode</CardTitle>
          <CardDescription>
            Control how the sidebar navigation is displayed
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between py-3">
            <div className="space-y-1">
              <Label htmlFor="testing-only-mode" className="text-base font-medium cursor-pointer">
                Testing Only Mode
              </Label>
              <p className="text-sm text-muted-foreground">
                Show only the Testing section and hide all other SDLC phases
              </p>
            </div>
            <Switch
              id="testing-only-mode"
              checked={testingOnlyMode}
              onCheckedChange={handleTestingOnlyModeToggle}
            />
          </div>
          {testingOnlyMode && (
            <Alert className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Only the Testing section will be visible in the sidebar for all users.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Screenshot Storage Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle>Storage Settings</CardTitle>
          <CardDescription>
            Configure screenshot storage to optimize disk usage
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between py-3">
            <div className="space-y-1">
              <Label htmlFor="screenshot-failure-only" className="text-base font-medium cursor-pointer">
                Screenshot on Failure Only
              </Label>
              <p className="text-sm text-muted-foreground">
                Only capture screenshots for failed test steps to reduce storage usage
              </p>
            </div>
            <Switch
              id="screenshot-failure-only"
              checked={screenshotOnFailureOnly}
              onCheckedChange={handleScreenshotSettingToggle}
            />
          </div>
          {screenshotOnFailureOnly && (
            <Alert className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Screenshots will only be captured when a test step fails. This significantly reduces storage usage.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Menu Items Card */}
      <Card>
        <CardHeader>
          <CardTitle>Menu Configuration</CardTitle>
          <CardDescription>
            Configure which menu items are visible in the sidebar. Drag to reorder.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={menuItems.map((item) => item.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-0">
                {menuItems.map((item) => (
                  <SortableMenuItem
                    key={item.id}
                    item={item}
                    onToggle={handleToggle}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
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
    </div>
  );
};
