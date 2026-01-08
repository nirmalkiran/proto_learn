import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Trash2, Save, Code, Variable, Sparkles } from "lucide-react";
import { GeneratedTestCase } from "./types";

interface TestCaseDataEditorProps {
  testCase: GeneratedTestCase;
  onUpdate: (testCase: GeneratedTestCase) => void;
}

type BodyType = 'none' | 'json' | 'form-data' | 'x-www-form-urlencoded' | 'xml' | 'text' | 'binary';

interface KeyValuePair {
  key: string;
  value: string;
  enabled: boolean;
}

export const TestCaseDataEditor = ({ testCase, onUpdate }: TestCaseDataEditorProps) => {
  const [activeTab, setActiveTab] = useState("params");
  const [bodyType, setBodyType] = useState<BodyType>(
    testCase.body ? (typeof testCase.body === 'string' ? 'text' : 'json') : 'none'
  );
  const [hasChanges, setHasChanges] = useState(false);

  // Convert object to key-value pairs
  const objectToKeyValuePairs = (obj?: Record<string, any>): KeyValuePair[] => {
    if (!obj || typeof obj !== 'object') return [{ key: '', value: '', enabled: true }];
    const pairs = Object.entries(obj).map(([key, value]) => ({
      key,
      value: String(value),
      enabled: true
    }));
    return pairs.length > 0 ? pairs : [{ key: '', value: '', enabled: true }];
  };

  // Convert key-value pairs back to object
  const keyValuePairsToObject = (pairs: KeyValuePair[]): Record<string, string> => {
    return pairs
      .filter(p => p.enabled && p.key.trim())
      .reduce((acc, p) => ({ ...acc, [p.key]: p.value }), {});
  };

  const [params, setParams] = useState<KeyValuePair[]>(objectToKeyValuePairs(testCase.parameters));
  const [headers, setHeaders] = useState<KeyValuePair[]>(objectToKeyValuePairs(testCase.headers));
  const [bodyContent, setBodyContent] = useState(
    testCase.body 
      ? (typeof testCase.body === 'object' ? JSON.stringify(testCase.body, null, 2) : String(testCase.body))
      : ''
  );

  const updateParams = (index: number, field: keyof KeyValuePair, value: string | boolean) => {
    const newParams = [...params];
    newParams[index] = { ...newParams[index], [field]: value };
    setParams(newParams);
    setHasChanges(true);
  };

  const addParam = () => {
    setParams([...params, { key: '', value: '', enabled: true }]);
    setHasChanges(true);
  };

  const removeParam = (index: number) => {
    setParams(params.filter((_, i) => i !== index));
    setHasChanges(true);
  };

  const updateHeaders = (index: number, field: keyof KeyValuePair, value: string | boolean) => {
    const newHeaders = [...headers];
    newHeaders[index] = { ...newHeaders[index], [field]: value };
    setHeaders(newHeaders);
    setHasChanges(true);
  };

  const addHeader = () => {
    setHeaders([...headers, { key: '', value: '', enabled: true }]);
    setHasChanges(true);
  };

  const removeHeader = (index: number) => {
    setHeaders(headers.filter((_, i) => i !== index));
    setHasChanges(true);
  };

  const handleBodyChange = (value: string) => {
    setBodyContent(value);
    setHasChanges(true);
  };

  const handleBodyTypeChange = (type: BodyType) => {
    setBodyType(type);
    if (type === 'none') {
      setBodyContent('');
    }
    setHasChanges(true);
  };

  const formatBody = () => {
    if (bodyType === 'json') {
      try {
        const parsed = JSON.parse(bodyContent);
        setBodyContent(JSON.stringify(parsed, null, 2));
      } catch (e) {
        // Invalid JSON, don't format
      }
    }
  };

  const saveChanges = () => {
    let parsedBody: any = undefined;
    
    if (bodyType !== 'none' && bodyContent.trim()) {
      if (bodyType === 'json') {
        try {
          parsedBody = JSON.parse(bodyContent);
        } catch (e) {
          parsedBody = bodyContent;
        }
      } else {
        parsedBody = bodyContent;
      }
    }

    const updatedTestCase: GeneratedTestCase = {
      ...testCase,
      parameters: keyValuePairsToObject(params),
      headers: keyValuePairsToObject(headers),
      body: parsedBody
    };

    onUpdate(updatedTestCase);
    setHasChanges(false);
  };

  const activeParamCount = params.filter(p => p.enabled && p.key.trim()).length;
  const activeHeaderCount = headers.filter(h => h.enabled && h.key.trim()).length;
  const hasBody = bodyType !== 'none' && bodyContent.trim();

  return (
    <div className="border-t mt-2 pt-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            {testCase.method}
          </Badge>
          <code className="text-xs text-muted-foreground">{testCase.endpoint}</code>
        </div>
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                  <Variable className="h-3 w-3" />
                  <span>{"{{var}}"}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="text-xs">
                  Use <code className="bg-muted px-1 rounded">{"{{variable_name}}"}</code> to inject environment variables. 
                  Manage variables via the Environment button in the header.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {hasChanges && (
            <Button size="sm" onClick={saveChanges} className="h-7">
              <Save className="h-3 w-3 mr-1" />
              Save Changes
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-8">
          <TabsTrigger value="params" className="text-xs h-7 px-3">
            Params {activeParamCount > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{activeParamCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="body" className="text-xs h-7 px-3">
            Body {hasBody && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">1</Badge>}
          </TabsTrigger>
          <TabsTrigger value="headers" className="text-xs h-7 px-3">
            Headers {activeHeaderCount > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{activeHeaderCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="auth" className="text-xs h-7 px-3">Auth</TabsTrigger>
        </TabsList>

        <TabsContent value="params" className="mt-3">
          <div className="space-y-2">
            <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 text-xs text-muted-foreground font-medium px-1">
              <span className="w-6"></span>
              <span>Key</span>
              <span>Value</span>
              <span className="w-8"></span>
            </div>
            {params.map((param, idx) => (
              <div key={idx} className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 items-center">
                <input
                  type="checkbox"
                  checked={param.enabled}
                  onChange={(e) => updateParams(idx, 'enabled', e.target.checked)}
                  className="h-4 w-4 rounded border-muted-foreground/25"
                />
                <Input
                  placeholder="Parameter name"
                  value={param.key}
                  onChange={(e) => updateParams(idx, 'key', e.target.value)}
                  className="h-8 text-xs"
                />
                <Input
                  placeholder="Value"
                  value={param.value}
                  onChange={(e) => updateParams(idx, 'value', e.target.value)}
                  className="h-8 text-xs"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => removeParam(idx)}
                >
                  <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addParam} className="h-7 text-xs">
              <Plus className="h-3 w-3 mr-1" />
              Add Parameter
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="body" className="mt-3">
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              {(['none', 'form-data', 'x-www-form-urlencoded', 'json', 'xml', 'text'] as BodyType[]).map((type) => (
                <Button
                  key={type}
                  variant={bodyType === type ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleBodyTypeChange(type)}
                  className="h-7 text-xs"
                >
                  {type === 'x-www-form-urlencoded' ? 'urlencoded' : type}
                </Button>
              ))}
            </div>

            {bodyType !== 'none' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Request Body</Label>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      Supports {"{{variables}}"}
                    </span>
                  </div>
                  {bodyType === 'json' && (
                    <Button variant="ghost" size="sm" onClick={formatBody} className="h-6 text-xs">
                      <Code className="h-3 w-3 mr-1" />
                      Format
                    </Button>
                  )}
                </div>
                <Textarea
                  placeholder={bodyType === 'json' ? '{\n  "key": "{{my_variable}}"\n}' : 'Enter request body... Use {{var}} for variables'}
                  value={bodyContent}
                  onChange={(e) => handleBodyChange(e.target.value)}
                  className="font-mono text-xs min-h-[150px]"
                />
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="headers" className="mt-3">
          <div className="space-y-2">
            <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 text-xs text-muted-foreground font-medium px-1">
              <span className="w-6"></span>
              <span>Key</span>
              <span>Value</span>
              <span className="w-8"></span>
            </div>
            {headers.map((header, idx) => (
              <div key={idx} className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 items-center">
                <input
                  type="checkbox"
                  checked={header.enabled}
                  onChange={(e) => updateHeaders(idx, 'enabled', e.target.checked)}
                  className="h-4 w-4 rounded border-muted-foreground/25"
                />
                <Input
                  placeholder="Header name"
                  value={header.key}
                  onChange={(e) => updateHeaders(idx, 'key', e.target.value)}
                  className="h-8 text-xs"
                />
                <Input
                  placeholder="Value"
                  value={header.value}
                  onChange={(e) => updateHeaders(idx, 'value', e.target.value)}
                  className="h-8 text-xs"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => removeHeader(idx)}
                >
                  <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addHeader} className="h-7 text-xs">
              <Plus className="h-3 w-3 mr-1" />
              Add Header
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="auth" className="mt-3">
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              Authorization settings for this test case. Leave empty to use the global auth token.
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Auth Type</Label>
              <Select defaultValue="inherit">
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inherit">Inherit from parent</SelectItem>
                  <SelectItem value="none">No Auth</SelectItem>
                  <SelectItem value="bearer">Bearer Token</SelectItem>
                  <SelectItem value="basic">Basic Auth</SelectItem>
                  <SelectItem value="apikey">API Key</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
