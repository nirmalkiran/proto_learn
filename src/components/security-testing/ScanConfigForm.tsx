import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Shield, Plus, Trash2, AlertTriangle, Lock, Globe, Key, Users } from "lucide-react";
import { SecurityScanConfig, Role, OWASP_CATEGORIES, OWASPCategoryKey } from "./types";

interface ScanConfigFormProps {
  config?: Partial<SecurityScanConfig>;
  onSave: (config: Partial<SecurityScanConfig>) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export const ScanConfigForm = ({ config, onSave, onCancel, isLoading }: ScanConfigFormProps) => {
  const [formData, setFormData] = useState<Partial<SecurityScanConfig>>({
    name: config?.name || '',
    target_url: config?.target_url || '',
    target_urls: config?.target_urls || [],
    target_type: config?.target_type || 'web',
    environment: config?.environment || 'dev',
    auth_type: config?.auth_type || 'none',
    auth_config: config?.auth_config || {},
    roles: config?.roles || [],
    scan_depth: config?.scan_depth || 'medium',
    enabled_categories: config?.enabled_categories || Object.keys(OWASP_CATEGORIES),
    rate_limit_rps: config?.rate_limit_rps || 10,
    aggressive_mode: config?.aggressive_mode || false,
  });

  const [newRole, setNewRole] = useState<Role>({ name: '', token: '' });
  const [newTargetUrl, setNewTargetUrl] = useState('');

  const updateField = <K extends keyof SecurityScanConfig>(field: K, value: SecurityScanConfig[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const updateAuthConfig = (key: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      auth_config: { ...prev.auth_config, [key]: value },
    }));
  };

  const addRole = () => {
    if (newRole.name) {
      setFormData(prev => ({
        ...prev,
        roles: [...(prev.roles || []), newRole],
      }));
      setNewRole({ name: '', token: '' });
    }
  };

  const removeRole = (index: number) => {
    setFormData(prev => ({
      ...prev,
      roles: (prev.roles || []).filter((_, i) => i !== index),
    }));
  };

  const addTargetUrl = () => {
    if (newTargetUrl && newTargetUrl.trim()) {
      setFormData(prev => ({
        ...prev,
        target_urls: [...(prev.target_urls || []), newTargetUrl.trim()],
      }));
      setNewTargetUrl('');
    }
  };

  const removeTargetUrl = (index: number) => {
    setFormData(prev => ({
      ...prev,
      target_urls: (prev.target_urls || []).filter((_, i) => i !== index),
    }));
  };

  const toggleCategory = (category: string) => {
    setFormData(prev => {
      const enabled = prev.enabled_categories || [];
      if (enabled.includes(category)) {
        return { ...prev, enabled_categories: enabled.filter(c => c !== category) };
      }
      return { ...prev, enabled_categories: [...enabled, category] };
    });
  };

  const handleSubmit = () => {
    onSave(formData);
  };

  return (
    <div className="space-y-6">
      {/* Basic Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Target Configuration
          </CardTitle>
          <CardDescription>Define the target application and scanning parameters</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Configuration Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="e.g., Production API Scan"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="target_url">Primary Target URL</Label>
              <Input
                id="target_url"
                value={formData.target_url}
                onChange={(e) => updateField('target_url', e.target.value)}
                placeholder="https://api.example.com"
              />
            </div>
          </div>

          {/* Additional Target URLs */}
          <div className="space-y-3">
            <Label>Additional Target URLs</Label>
            <div className="flex gap-2">
              <Input
                placeholder="https://another-api.example.com"
                value={newTargetUrl}
                onChange={(e) => setNewTargetUrl(e.target.value)}
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTargetUrl();
                  }
                }}
              />
              <Button onClick={addTargetUrl} size="icon" variant="outline" type="button">
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {(formData.target_urls?.length || 0) > 0 && (
              <div className="space-y-2">
                {formData.target_urls?.map((url, index) => (
                  <div key={index} className="flex items-center justify-between p-2 border rounded bg-muted/30">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm truncate">{url}</span>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeTargetUrl(index)} type="button">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Add additional URLs to scan multiple endpoints in a single configuration
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Target Type</Label>
              <Select value={formData.target_type} onValueChange={(v) => updateField('target_type', v as 'web' | 'api')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="web">Web Application</SelectItem>
                  <SelectItem value="api">API</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Environment</Label>
              <Select value={formData.environment} onValueChange={(v) => updateField('environment', v as 'dev' | 'qa' | 'prod')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dev">Development</SelectItem>
                  <SelectItem value="qa">QA / Staging</SelectItem>
                  <SelectItem value="prod">Production</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Scan Depth</Label>
              <Select value={formData.scan_depth} onValueChange={(v) => updateField('scan_depth', v as 'low' | 'medium' | 'deep')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low (Quick)</SelectItem>
                  <SelectItem value="medium">Medium (Balanced)</SelectItem>
                  <SelectItem value="deep">Deep (Comprehensive)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Authentication */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Authentication
          </CardTitle>
          <CardDescription>Configure authentication for authenticated scanning</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Authentication Type</Label>
            <Select value={formData.auth_type} onValueChange={(v) => updateField('auth_type', v as SecurityScanConfig['auth_type'])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (Unauthenticated)</SelectItem>
                <SelectItem value="basic">Basic Auth</SelectItem>
                <SelectItem value="token">Bearer Token (JWT/API Key)</SelectItem>
                <SelectItem value="oauth">OAuth 2.0</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.auth_type === 'basic' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Username</Label>
                <Input
                  value={(formData.auth_config?.username as string) || ''}
                  onChange={(e) => updateAuthConfig('username', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={(formData.auth_config?.password as string) || ''}
                  onChange={(e) => updateAuthConfig('password', e.target.value)}
                />
              </div>
            </div>
          )}

          {formData.auth_type === 'token' && (
            <div className="space-y-2">
              <Label>Bearer Token</Label>
              <Input
                type="password"
                value={(formData.auth_config?.token as string) || ''}
                onChange={(e) => updateAuthConfig('token', e.target.value)}
                placeholder="Enter JWT or API key"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Role-Based Testing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Role-Based Testing
          </CardTitle>
          <CardDescription>Define roles for access control testing (IDOR, privilege escalation)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Role name (e.g., Admin)"
              value={newRole.name}
              onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
              className="flex-1"
            />
            <Input
              placeholder="Token (optional)"
              value={newRole.token || ''}
              onChange={(e) => setNewRole({ ...newRole, token: e.target.value })}
              className="flex-1"
              type="password"
            />
            <Button onClick={addRole} size="icon" variant="outline">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {(formData.roles?.length || 0) > 0 && (
            <div className="space-y-2">
              {formData.roles?.map((role, index) => (
                <div key={index} className="flex items-center justify-between p-2 border rounded">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{role.name}</Badge>
                    {role.token && <Key className="h-3 w-3 text-muted-foreground" />}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeRole(index)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* OWASP Categories */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            OWASP Top 10 Categories
          </CardTitle>
          <CardDescription>Select which vulnerability categories to test</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(OWASP_CATEGORIES).map(([key, { name, description }]) => (
              <div key={key} className="flex items-start space-x-2 p-2 border rounded hover:bg-muted/50">
                <Checkbox
                  id={key}
                  checked={formData.enabled_categories?.includes(key)}
                  onCheckedChange={() => toggleCategory(key)}
                />
                <div className="grid gap-1 leading-none">
                  <label htmlFor={key} className="text-sm font-medium cursor-pointer">
                    {key}: {name}
                  </label>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Safety & Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Safety & Performance
          </CardTitle>
          <CardDescription>Configure rate limiting and aggressive testing options</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Rate Limit (requests per second)</Label>
              <p className="text-xs text-muted-foreground">Limit scan speed to avoid overloading target</p>
            </div>
            <Input
              type="number"
              min={1}
              max={100}
              value={formData.rate_limit_rps}
              onChange={(e) => updateField('rate_limit_rps', parseInt(e.target.value) || 10)}
              className="w-24"
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="flex items-center gap-2">
                Aggressive Mode
                <Badge variant="destructive" className="text-xs">Requires Opt-In</Badge>
              </Label>
              <p className="text-xs text-muted-foreground">
                Enable potentially disruptive tests like SSRF with internal URLs
              </p>
            </div>
            <Switch
              checked={formData.aggressive_mode}
              onCheckedChange={(checked) => updateField('aggressive_mode', checked)}
            />
          </div>

          {formData.aggressive_mode && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
              <p className="text-sm text-destructive flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Aggressive mode may cause service disruption. Only use on test environments!
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={isLoading || !formData.name || !formData.target_url}>
          {config?.id ? 'Update Configuration' : 'Create Configuration'}
        </Button>
      </div>
    </div>
  );
};
