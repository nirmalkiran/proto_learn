import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Shield, AlertTriangle, CheckCircle, Loader2, Info } from "lucide-react";
import { useAISafetyControls, SafetyConfig, DEFAULT_SAFETY_CONFIG } from "@/hooks/useAISafetyControls";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface SafetyControlsConfigProps {
  projectId: string;
  isEmbedded?: boolean;
}

export const SafetyControlsConfig = ({ projectId, isEmbedded = false }: SafetyControlsConfigProps) => {
  const {
    safetyConfig,
    loadSafetyConfig,
    saveSafetyConfig,
    getSafetyStatus,
    isLoading,
  } = useAISafetyControls(projectId);

  const [localConfig, setLocalConfig] = useState<SafetyConfig>(DEFAULT_SAFETY_CONFIG);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadSafetyConfig(projectId);
  }, [projectId, loadSafetyConfig]);

  useEffect(() => {
    setLocalConfig(safetyConfig);
  }, [safetyConfig]);

  useEffect(() => {
    const changed = JSON.stringify(localConfig) !== JSON.stringify(safetyConfig);
    setHasChanges(changed);
  }, [localConfig, safetyConfig]);

  const handleSave = async () => {
    setIsSaving(true);
    await saveSafetyConfig(projectId, localConfig);
    setIsSaving(false);
    setHasChanges(false);
  };

  const handleReset = () => {
    setLocalConfig(DEFAULT_SAFETY_CONFIG);
  };

  const status = getSafetyStatus();

  const content = (
    <div className="space-y-6">
      {/* Usage Status */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Daily Usage</span>
        </div>
        <span className="text-sm font-medium">
          {status.dailyUsage} / {status.dailyLimit} generations
        </span>
      </div>

      <Separator />

      {/* Confidence Thresholds */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Confidence Thresholds
        </h4>
        
        <div className="space-y-4 pl-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Label className="cursor-help">Minimum Confidence Threshold</Label>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">Content below this confidence level will show warnings</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <span className="text-sm font-medium text-primary">
                {Math.round(localConfig.minConfidenceThreshold * 100)}%
              </span>
            </div>
            <Slider
              value={[localConfig.minConfidenceThreshold * 100]}
              onValueChange={([value]) => 
                setLocalConfig(prev => ({ ...prev, minConfidenceThreshold: value / 100 }))
              }
              max={100}
              step={5}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              AI content below this threshold will require human review
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Label className="cursor-help">Auto-Approve Threshold</Label>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">Content above this confidence can be auto-approved</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <span className="text-sm font-medium text-green-600">
                {Math.round(localConfig.autoApproveThreshold * 100)}%
              </span>
            </div>
            <Slider
              value={[localConfig.autoApproveThreshold * 100]}
              onValueChange={([value]) => 
                setLocalConfig(prev => ({ ...prev, autoApproveThreshold: value / 100 }))
              }
              max={100}
              step={5}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              AI content above this threshold can bypass manual approval (if enabled)
            </p>
          </div>
        </div>
      </div>

      <Separator />

      {/* Rate Limiting */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-green-500" />
          Rate Limiting
        </h4>
        
        <div className="space-y-2 pl-6">
          <Label htmlFor="maxDaily">Maximum Daily AI Generations</Label>
          <Input
            id="maxDaily"
            type="number"
            min={1}
            max={1000}
            value={localConfig.maxDailyGenerations}
            onChange={(e) => 
              setLocalConfig(prev => ({ 
                ...prev, 
                maxDailyGenerations: Math.max(1, parseInt(e.target.value) || 100) 
              }))
            }
            className="w-32"
          />
          <p className="text-xs text-muted-foreground">
            Limit AI generations per day to control costs and prevent abuse
          </p>
        </div>
      </div>

      <Separator />

      {/* Approval Requirements */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Shield className="h-4 w-4 text-blue-500" />
          Approval Requirements
        </h4>
        
        <div className="space-y-4 pl-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Require Approval for Test Cases</Label>
              <p className="text-xs text-muted-foreground">
                AI-generated test cases need human review before saving
              </p>
            </div>
            <Switch
              checked={localConfig.requireApprovalForTestCases}
              onCheckedChange={(checked) => 
                setLocalConfig(prev => ({ ...prev, requireApprovalForTestCases: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Require Approval for API Test Cases</Label>
              <p className="text-xs text-muted-foreground">
                AI-generated API test cases need human review before saving
              </p>
            </div>
            <Switch
              checked={localConfig.requireApprovalForAPITestCases}
              onCheckedChange={(checked) => 
                setLocalConfig(prev => ({ ...prev, requireApprovalForAPITestCases: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Require Approval for Automation Scripts</Label>
              <p className="text-xs text-muted-foreground">
                AI-generated automation scripts and no-code steps need human review
              </p>
            </div>
            <Switch
              checked={localConfig.requireApprovalForAutomation}
              onCheckedChange={(checked) => 
                setLocalConfig(prev => ({ ...prev, requireApprovalForAutomation: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Require Approval for Defect Reports</Label>
              <p className="text-xs text-muted-foreground">
                AI-generated defect reports need human review before submission
              </p>
            </div>
            <Switch
              checked={localConfig.requireApprovalForDefects}
              onCheckedChange={(checked) => 
                setLocalConfig(prev => ({ ...prev, requireApprovalForDefects: checked }))
              }
            />
          </div>

          <Separator className="my-2" />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable Audit Logging</Label>
              <p className="text-xs text-muted-foreground">
                Track all AI generations, approvals, and rejections
              </p>
            </div>
            <Switch
              checked={localConfig.enableAuditLogging}
              onCheckedChange={(checked) => 
                setLocalConfig(prev => ({ ...prev, enableAuditLogging: checked }))
              }
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={handleReset} disabled={isSaving}>
          Reset to Defaults
        </Button>
        <div className="flex gap-2">
          {hasChanges && (
            <Badge variant="outline" className="text-amber-600 border-amber-600">
              Unsaved changes
            </Badge>
          )}
          <Button onClick={handleSave} disabled={isSaving || !hasChanges}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Configuration"
            )}
          </Button>
        </div>
      </div>
    </div>
  );

  if (isEmbedded) {
    return content;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle>AI Safety Controls</CardTitle>
          </div>
          <Badge variant={localConfig.enableAuditLogging ? "default" : "secondary"}>
            {localConfig.enableAuditLogging ? "Audit Enabled" : "Audit Disabled"}
          </Badge>
        </div>
        <CardDescription>
          Configure confidence thresholds, rate limits, and approval requirements for AI-generated content
        </CardDescription>
      </CardHeader>
      <CardContent>
        {content}
      </CardContent>
    </Card>
  );
};
