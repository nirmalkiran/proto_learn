import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Plus, 
  Trash2, 
  Settings2, 
  Copy, 
  Eye, 
  EyeOff,
  Variable,
  Sparkles
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export interface EnvVariable {
  id: string;
  key: string;
  value: string;
  type: 'string' | 'number' | 'boolean' | 'secret';
  description?: string;
  enabled: boolean;
}

export interface Environment {
  id: string;
  name: string;
  variables: EnvVariable[];
  isActive: boolean;
}

interface EnvironmentVariablesManagerProps {
  environments: Environment[];
  activeEnvironmentId: string | null;
  onEnvironmentsChange: (environments: Environment[]) => void;
  onActiveEnvironmentChange: (environmentId: string | null) => void;
}

export const EnvironmentVariablesManager = ({
  environments,
  activeEnvironmentId,
  onEnvironmentsChange,
  onActiveEnvironmentChange
}: EnvironmentVariablesManagerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Set<string>>(new Set());
  const [editingEnvId, setEditingEnvId] = useState<string | null>(null);
  const [newEnvName, setNewEnvName] = useState("");
  const { toast } = useToast();

  const activeEnvironment = environments.find(e => e.id === activeEnvironmentId);

  const createEnvironment = () => {
    if (!newEnvName.trim()) {
      toast({
        title: "Name Required",
        description: "Please enter an environment name",
        variant: "destructive"
      });
      return;
    }

    const newEnv: Environment = {
      id: `env-${Date.now()}`,
      name: newEnvName.trim(),
      variables: [],
      isActive: environments.length === 0
    };

    onEnvironmentsChange([...environments, newEnv]);
    if (environments.length === 0) {
      onActiveEnvironmentChange(newEnv.id);
    }
    setNewEnvName("");
    toast({ title: "Environment Created" });
  };

  const deleteEnvironment = (envId: string) => {
    onEnvironmentsChange(environments.filter(e => e.id !== envId));
    if (activeEnvironmentId === envId) {
      const remaining = environments.filter(e => e.id !== envId);
      onActiveEnvironmentChange(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const addVariable = (envId: string) => {
    const newVariable: EnvVariable = {
      id: `var-${Date.now()}`,
      key: '',
      value: '',
      type: 'string',
      enabled: true
    };

    onEnvironmentsChange(environments.map(env => 
      env.id === envId 
        ? { ...env, variables: [...env.variables, newVariable] }
        : env
    ));
  };

  const updateVariable = (envId: string, varId: string, updates: Partial<EnvVariable>) => {
    onEnvironmentsChange(environments.map(env => 
      env.id === envId 
        ? { 
            ...env, 
            variables: env.variables.map(v => 
              v.id === varId ? { ...v, ...updates } : v
            ) 
          }
        : env
    ));
  };

  const deleteVariable = (envId: string, varId: string) => {
    onEnvironmentsChange(environments.map(env => 
      env.id === envId 
        ? { ...env, variables: env.variables.filter(v => v.id !== varId) }
        : env
    ));
  };

  const toggleSecretVisibility = (varId: string) => {
    const newSet = new Set(showSecrets);
    if (newSet.has(varId)) {
      newSet.delete(varId);
    } else {
      newSet.add(varId);
    }
    setShowSecrets(newSet);
  };

  const copyVariableReference = (key: string) => {
    navigator.clipboard.writeText(`{{${key}}}`);
    toast({
      title: "Copied",
      description: `{{${key}}} copied to clipboard`
    });
  };

  const activeVarCount = activeEnvironment?.variables.filter(v => v.enabled && v.key).length || 0;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Variable className="h-4 w-4" />
          Environment
          {activeVarCount > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5">
              {activeVarCount}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Environment Variables
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-[200px_1fr] gap-4 h-[500px]">
          {/* Environments List */}
          <div className="border rounded-lg p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Input
                placeholder="New environment"
                value={newEnvName}
                onChange={(e) => setNewEnvName(e.target.value)}
                className="h-8 text-xs"
                onKeyDown={(e) => e.key === 'Enter' && createEnvironment()}
              />
              <Button size="sm" onClick={createEnvironment} className="h-8 w-8 p-0">
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <ScrollArea className="h-[420px]">
              <div className="space-y-1">
                {environments.map(env => (
                  <div
                    key={env.id}
                    className={`flex items-center justify-between p-2 rounded cursor-pointer text-sm ${
                      activeEnvironmentId === env.id
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted'
                    }`}
                    onClick={() => {
                      onActiveEnvironmentChange(env.id);
                      setEditingEnvId(env.id);
                    }}
                  >
                    <span className="truncate flex-1">{env.name}</span>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className={`text-[10px] ${
                        activeEnvironmentId === env.id ? 'border-primary-foreground/30' : ''
                      }`}>
                        {env.variables.filter(v => v.enabled).length}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteEnvironment(env.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
                {environments.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No environments yet
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Variables Editor */}
          <div className="border rounded-lg p-3">
            {activeEnvironment ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">{activeEnvironment.name}</h3>
                  <Button variant="outline" size="sm" onClick={() => addVariable(activeEnvironment.id)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Variable
                  </Button>
                </div>

                <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded flex items-center gap-2">
                  <Sparkles className="h-3 w-3" />
                  Use <code className="bg-muted px-1 rounded">{"{{variable_name}}"}</code> in params, headers, or body to inject values
                </div>

                <ScrollArea className="h-[380px]">
                  <div className="space-y-2">
                    {/* Header */}
                    <div className="grid grid-cols-[auto_1fr_1.5fr_100px_auto_auto] gap-2 text-xs text-muted-foreground font-medium px-1 sticky top-0 bg-background pb-1">
                      <span className="w-6"></span>
                      <span>Variable Name</span>
                      <span>Value</span>
                      <span>Type</span>
                      <span className="w-8"></span>
                      <span className="w-8"></span>
                    </div>

                    {activeEnvironment.variables.map(variable => (
                      <div key={variable.id} className="grid grid-cols-[auto_1fr_1.5fr_100px_auto_auto] gap-2 items-center">
                        <input
                          type="checkbox"
                          checked={variable.enabled}
                          onChange={(e) => updateVariable(activeEnvironment.id, variable.id, { enabled: e.target.checked })}
                          className="h-4 w-4 rounded border-muted-foreground/25"
                        />
                        <Input
                          placeholder="variable_name"
                          value={variable.key}
                          onChange={(e) => updateVariable(activeEnvironment.id, variable.id, { key: e.target.value })}
                          className="h-8 text-xs font-mono"
                        />
                        <div className="relative">
                          <Input
                            type={variable.type === 'secret' && !showSecrets.has(variable.id) ? 'password' : 'text'}
                            placeholder="Value"
                            value={variable.value}
                            onChange={(e) => updateVariable(activeEnvironment.id, variable.id, { value: e.target.value })}
                            className="h-8 text-xs pr-8"
                          />
                          {variable.type === 'secret' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="absolute right-0 top-0 h-8 w-8 p-0"
                              onClick={() => toggleSecretVisibility(variable.id)}
                            >
                              {showSecrets.has(variable.id) ? (
                                <EyeOff className="h-3 w-3" />
                              ) : (
                                <Eye className="h-3 w-3" />
                              )}
                            </Button>
                          )}
                        </div>
                        <Select
                          value={variable.type}
                          onValueChange={(value) => updateVariable(activeEnvironment.id, variable.id, { type: value as EnvVariable['type'] })}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="string">String</SelectItem>
                            <SelectItem value="number">Number</SelectItem>
                            <SelectItem value="boolean">Boolean</SelectItem>
                            <SelectItem value="secret">Secret</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => variable.key && copyVariableReference(variable.key)}
                          disabled={!variable.key}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => deleteVariable(activeEnvironment.id, variable.id)}
                        >
                          <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    ))}

                    {activeEnvironment.variables.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        <Variable className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>No variables defined</p>
                        <p className="text-xs">Click "Add Variable" to create one</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Variable className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Select or create an environment</p>
                  <p className="text-xs mt-1">to manage variables</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Utility function to inject environment variables into a string
export const injectEnvironmentVariables = (
  text: string, 
  variables: EnvVariable[]
): string => {
  if (!text) return text;
  
  let result = text;
  const variablePattern = /\{\{(\w+)\}\}/g;
  
  result = result.replace(variablePattern, (match, varName) => {
    const variable = variables.find(v => v.key === varName && v.enabled);
    if (variable) {
      return variable.value;
    }
    return match; // Keep original if not found
  });
  
  return result;
};

// Utility function to inject variables into an object recursively
export const injectVariablesIntoObject = (
  obj: any, 
  variables: EnvVariable[]
): any => {
  if (typeof obj === 'string') {
    return injectEnvironmentVariables(obj, variables);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => injectVariablesIntoObject(item, variables));
  }
  
  if (obj && typeof obj === 'object') {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = injectVariablesIntoObject(value, variables);
    }
    return result;
  }
  
  return obj;
};

// Create default environment
export const createDefaultEnvironment = (): Environment => ({
  id: 'env-default',
  name: 'Default',
  variables: [
    { id: 'var-1', key: 'base_url', value: '', type: 'string', enabled: true },
    { id: 'var-2', key: 'api_key', value: '', type: 'secret', enabled: true },
  ],
  isActive: true
});
