import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { 
  Settings, Plus, Trash2, Edit, Copy, Shield, Zap, 
  Target, AlertTriangle, Bug, Search
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { BurpScanProfile, BurpScanMode } from "./types";

type ProfileType = 'beginner' | 'standard' | 'enterprise';

interface BurpScanProfilesProps {
  projectId: string;
  onSelectProfile?: (profile: BurpScanProfile) => void;
}

const DEFAULT_PROFILE: Partial<BurpScanProfile> = {
  name: '',
  description: '',
  profile_type: 'standard',
  scan_mode: 'active',
  crawl_enabled: true,
  crawl_depth: 5,
  crawl_max_urls: 1000,
  active_scan_enabled: true,
  passive_scan_enabled: true,
  oast_enabled: true,
  dom_analysis_enabled: true,
  fuzzing_enabled: false,
  brute_force_enabled: false,
  destructive_tests_enabled: false,
  requests_per_second: 10,
  concurrent_requests: 5,
  handle_javascript: true,
  follow_redirects: true,
};

export const BurpScanProfiles = ({ projectId, onSelectProfile }: BurpScanProfilesProps) => {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<BurpScanProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Partial<BurpScanProfile> | null>(null);

  useEffect(() => {
    loadProfiles();
  }, [projectId]);

  const loadProfiles = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('burp_scan_profiles')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProfiles(data || []);
    } catch (error) {
      console.error('Error loading profiles:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!editingProfile?.name) {
      toast.error('Profile name is required');
      return;
    }

    try {
      if (editingProfile.id) {
        const { error } = await (supabase as any)
          .from('burp_scan_profiles')
          .update({
            ...editingProfile,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingProfile.id);

        if (error) throw error;
        toast.success('Profile updated');
      } else {
        const { error } = await (supabase as any)
          .from('burp_scan_profiles')
          .insert({
            ...editingProfile,
            project_id: projectId,
            created_by: user?.id,
          });

        if (error) throw error;
        toast.success('Profile created');
      }

      setShowProfileDialog(false);
      setEditingProfile(null);
      loadProfiles();
    } catch (error) {
      console.error('Error saving profile:', error);
      toast.error('Failed to save profile');
    }
  };

  const handleDeleteProfile = async (profileId: string) => {
    if (!confirm('Delete this scan profile?')) return;

    try {
      const { error } = await (supabase as any)
        .from('burp_scan_profiles')
        .delete()
        .eq('id', profileId);

      if (error) throw error;
      toast.success('Profile deleted');
      loadProfiles();
    } catch (error) {
      console.error('Error deleting profile:', error);
      toast.error('Failed to delete profile');
    }
  };

  const handleDuplicateProfile = (profile: BurpScanProfile) => {
    const { id, created_at, updated_at, ...rest } = profile;
    setEditingProfile({ ...rest, name: `${profile.name} (Copy)` });
    setShowProfileDialog(true);
  };

  const getProfileIcon = (type: string) => {
    switch (type) {
      case 'quick': return <Zap className="h-4 w-4 text-yellow-500" />;
      case 'deep': return <Search className="h-4 w-4 text-blue-500" />;
      case 'api': return <Target className="h-4 w-4 text-purple-500" />;
      default: return <Settings className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const updateField = <K extends keyof BurpScanProfile>(field: K, value: BurpScanProfile[K]) => {
    setEditingProfile(prev => prev ? { ...prev, [field]: value } : null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Scan Profiles</h3>
        </div>
        <Button size="sm" onClick={() => { setEditingProfile(DEFAULT_PROFILE); setShowProfileDialog(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          New Profile
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4">
          {[1, 2].map(i => (
            <Card key={i} className="animate-pulse">
              <CardHeader><div className="h-5 bg-muted rounded w-1/2" /></CardHeader>
              <CardContent><div className="h-20 bg-muted rounded" /></CardContent>
            </Card>
          ))}
        </div>
      ) : profiles.length === 0 ? (
        <Card className="p-8 text-center">
          <Settings className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h4 className="text-lg font-medium mb-2">No Scan Profiles</h4>
          <p className="text-sm text-muted-foreground mb-4">
            Create a scan profile to configure how Burp Suite scans your targets
          </p>
          <Button onClick={() => { setEditingProfile(DEFAULT_PROFILE); setShowProfileDialog(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Create Profile
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {profiles.map((profile) => (
            <Card key={profile.id} className="hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => onSelectProfile?.(profile)}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getProfileIcon(profile.profile_type)}
                    <CardTitle className="text-base">{profile.name}</CardTitle>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDuplicateProfile(profile); }}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setEditingProfile(profile); setShowProfileDialog(true); }}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDeleteProfile(profile.id); }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                {profile.description && (
                  <CardDescription className="text-xs">{profile.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1">
                  <Badge variant="outline" className="text-xs">{profile.scan_mode.replace('_', ' ')}</Badge>
                  {profile.crawl_enabled && <Badge variant="secondary" className="text-xs">Crawl</Badge>}
                  {profile.active_scan_enabled && <Badge variant="secondary" className="text-xs">Active</Badge>}
                  {profile.passive_scan_enabled && <Badge variant="secondary" className="text-xs">Passive</Badge>}
                  {profile.oast_enabled && <Badge className="bg-orange-500 text-xs">OAST</Badge>}
                  {profile.destructive_tests_enabled && (
                    <Badge className="bg-red-500 text-xs">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Destructive
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Profile Editor Dialog */}
      <Dialog open={showProfileDialog} onOpenChange={setShowProfileDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProfile?.id ? 'Edit Profile' : 'New Scan Profile'}</DialogTitle>
            <DialogDescription>
              Configure how Burp Suite scans your targets
            </DialogDescription>
          </DialogHeader>

          {editingProfile && (
            <div className="space-y-4 py-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Profile Name *</Label>
                  <Input
                    value={editingProfile.name || ''}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="e.g., API Security Scan"
                  />
                </div>
              <div className="space-y-2">
                <Label>Profile Type</Label>
                <Select 
                  value={editingProfile.profile_type || 'standard'} 
                  onValueChange={(v) => updateField('profile_type', v as ProfileType)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Beginner (Passive)</SelectItem>
                    <SelectItem value="standard">Standard (Balanced)</SelectItem>
                    <SelectItem value="enterprise">Enterprise (Full)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={editingProfile.description || ''}
                  onChange={(e) => updateField('description', e.target.value)}
                  placeholder="Describe this profile's purpose"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Scan Mode</Label>
                <Select 
                  value={editingProfile.scan_mode || 'active'} 
                  onValueChange={(v) => updateField('scan_mode', v as BurpScanMode)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="passive">Passive Only</SelectItem>
                    <SelectItem value="crawl">Crawl Only</SelectItem>
                    <SelectItem value="active">Active Scan</SelectItem>
                    <SelectItem value="audit">Full Audit</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Accordion type="multiple" defaultValue={['crawl', 'scan', 'performance']}>
                {/* Crawl Settings */}
                <AccordionItem value="crawl">
                  <AccordionTrigger>Crawl Settings</AccordionTrigger>
                  <AccordionContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label>Enable Crawling</Label>
                      <Switch
                        checked={editingProfile.crawl_enabled ?? true}
                        onCheckedChange={(v) => updateField('crawl_enabled', v)}
                      />
                    </div>
                    {editingProfile.crawl_enabled && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Crawl Depth</Label>
                          <Input
                            type="number"
                            min={1}
                            max={20}
                            value={editingProfile.crawl_depth || 5}
                            onChange={(e) => updateField('crawl_depth', parseInt(e.target.value) || 5)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Max URLs</Label>
                          <Input
                            type="number"
                            min={10}
                            max={10000}
                            value={editingProfile.crawl_max_urls || 1000}
                            onChange={(e) => updateField('crawl_max_urls', parseInt(e.target.value) || 1000)}
                          />
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <Label>Handle JavaScript</Label>
                      <Switch
                        checked={editingProfile.handle_javascript ?? true}
                        onCheckedChange={(v) => updateField('handle_javascript', v)}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Follow Redirects</Label>
                      <Switch
                        checked={editingProfile.follow_redirects ?? true}
                        onCheckedChange={(v) => updateField('follow_redirects', v)}
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Scan Settings */}
                <AccordionItem value="scan">
                  <AccordionTrigger>Scan Settings</AccordionTrigger>
                  <AccordionContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label>Active Scanning</Label>
                      <Switch
                        checked={editingProfile.active_scan_enabled ?? true}
                        onCheckedChange={(v) => updateField('active_scan_enabled', v)}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Passive Scanning</Label>
                      <Switch
                        checked={editingProfile.passive_scan_enabled ?? true}
                        onCheckedChange={(v) => updateField('passive_scan_enabled', v)}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>OAST (Collaborator)</Label>
                        <p className="text-xs text-muted-foreground">Out-of-band vulnerability detection</p>
                      </div>
                      <Switch
                        checked={editingProfile.oast_enabled ?? true}
                        onCheckedChange={(v) => updateField('oast_enabled', v)}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>DOM Analysis</Label>
                      <Switch
                        checked={editingProfile.dom_analysis_enabled ?? true}
                        onCheckedChange={(v) => updateField('dom_analysis_enabled', v)}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="flex items-center gap-2">
                          Destructive Tests
                          <Badge variant="destructive" className="text-xs">Caution</Badge>
                        </Label>
                        <p className="text-xs text-muted-foreground">May modify or delete data</p>
                      </div>
                      <Switch
                        checked={editingProfile.destructive_tests_enabled ?? false}
                        onCheckedChange={(v) => updateField('destructive_tests_enabled', v)}
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Performance */}
                <AccordionItem value="performance">
                  <AccordionTrigger>Performance</AccordionTrigger>
                  <AccordionContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Requests/Second</Label>
                        <Input
                          type="number"
                          min={1}
                          max={100}
                          value={editingProfile.requests_per_second || 10}
                          onChange={(e) => updateField('requests_per_second', parseInt(e.target.value) || 10)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Concurrent Requests</Label>
                        <Input
                          type="number"
                          min={1}
                          max={50}
                          value={editingProfile.concurrent_requests || 5}
                          onChange={(e) => updateField('concurrent_requests', parseInt(e.target.value) || 5)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Delay Between Requests (ms)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={5000}
                        value={editingProfile.delay_between_requests_ms || 0}
                        onChange={(e) => updateField('delay_between_requests_ms', parseInt(e.target.value) || 0)}
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProfileDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveProfile}>
              {editingProfile?.id ? 'Update Profile' : 'Create Profile'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
