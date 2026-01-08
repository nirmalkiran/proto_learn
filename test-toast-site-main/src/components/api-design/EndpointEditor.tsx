import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, Wand2, Copy } from "lucide-react";
import { 
  APIEndpoint, 
  APIParameter, 
  SchemaObject, 
  SchemaRef,
  HTTP_METHODS, 
  PARAMETER_LOCATIONS,
  HTTP_STATUS_CODES 
} from "./types";
import { SchemaEditor } from "./SchemaEditor";
import { generateSampleFromSchema } from "./utils";

interface EndpointEditorProps {
  endpoint: APIEndpoint;
  onChange: (endpoint: APIEndpoint) => void;
  schemaRefs: SchemaRef[];
  onResolveRef: (refPath: string) => SchemaObject | undefined;
}

export const EndpointEditor = ({ 
  endpoint, 
  onChange, 
  schemaRefs,
  onResolveRef 
}: EndpointEditorProps) => {
  const [newTag, setNewTag] = useState("");

  const methodColors: Record<string, string> = {
    GET: 'bg-emerald-500',
    POST: 'bg-blue-500',
    PUT: 'bg-amber-500',
    DELETE: 'bg-red-500',
    PATCH: 'bg-purple-500',
  };

  const handleAddParameter = () => {
    const newParam: APIParameter = {
      name: '',
      in: 'query',
      required: false,
      schema: { type: 'string' }
    };
    onChange({ ...endpoint, parameters: [...endpoint.parameters, newParam] });
  };

  const handleUpdateParameter = (index: number, param: APIParameter) => {
    const newParams = [...endpoint.parameters];
    newParams[index] = param;
    onChange({ ...endpoint, parameters: newParams });
  };

  const handleRemoveParameter = (index: number) => {
    onChange({ 
      ...endpoint, 
      parameters: endpoint.parameters.filter((_, i) => i !== index) 
    });
  };

  const handleAddResponse = (statusCode: string) => {
    const statusInfo = HTTP_STATUS_CODES.find(s => s.code === statusCode);
    onChange({
      ...endpoint,
      responses: {
        ...endpoint.responses,
        [statusCode]: {
          description: statusInfo?.description || 'Response',
          content: {
            'application/json': {
              schema: { type: 'object', properties: {} }
            }
          }
        }
      }
    });
  };

  const handleRemoveResponse = (statusCode: string) => {
    const { [statusCode]: _, ...rest } = endpoint.responses;
    onChange({ ...endpoint, responses: rest });
  };

  const handleAddTag = () => {
    if (newTag.trim() && !endpoint.tags.includes(newTag.trim())) {
      onChange({ ...endpoint, tags: [...endpoint.tags, newTag.trim()] });
      setNewTag("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    onChange({ ...endpoint, tags: endpoint.tags.filter(t => t !== tag) });
  };

  const handleToggleRequestBody = (enabled: boolean) => {
    if (enabled) {
      onChange({
        ...endpoint,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', properties: {} }
            }
          }
        }
      });
    } else {
      const { requestBody, ...rest } = endpoint;
      onChange(rest as APIEndpoint);
    }
  };

  const generateResponseExample = (statusCode: string) => {
    const response = endpoint.responses[statusCode];
    if (!response?.content?.['application/json']?.schema) return;

    const schema = response.content['application/json'].schema;
    const example = generateSampleFromSchema(schema, onResolveRef);

    onChange({
      ...endpoint,
      responses: {
        ...endpoint.responses,
        [statusCode]: {
          ...response,
          content: {
            'application/json': {
              ...response.content['application/json'],
              example
            }
          }
        }
      }
    });
  };

  const copyExample = (example: any) => {
    navigator.clipboard.writeText(JSON.stringify(example, null, 2));
  };

  return (
    <div className="space-y-6">
      {/* Basic Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <div className="w-32">
              <Label className="text-sm mb-1.5 block">Method</Label>
              <Select 
                value={endpoint.method} 
                onValueChange={(v) => onChange({ ...endpoint, method: v as typeof endpoint.method })}
              >
                <SelectTrigger>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${methodColors[endpoint.method]}`} />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {HTTP_METHODS.map(m => (
                    <SelectItem key={m} value={m}>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${methodColors[m]}`} />
                        {m}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex-1">
              <Label className="text-sm mb-1.5 block">Path</Label>
              <Input
                value={endpoint.path}
                onChange={(e) => onChange({ ...endpoint, path: e.target.value })}
                placeholder="/api/v1/resource/{id}"
              />
            </div>
          </div>
          
          <div>
            <Label className="text-sm mb-1.5 block">Summary</Label>
            <Input
              value={endpoint.summary}
              onChange={(e) => onChange({ ...endpoint, summary: e.target.value })}
              placeholder="Brief description of the endpoint"
            />
          </div>
          
          <div>
            <Label className="text-sm mb-1.5 block">Description</Label>
            <Textarea
              value={endpoint.description || ''}
              onChange={(e) => onChange({ ...endpoint, description: e.target.value })}
              placeholder="Detailed description..."
              rows={2}
            />
          </div>
          
          <div>
            <Label className="text-sm mb-1.5 block">Operation ID</Label>
            <Input
              value={endpoint.operationId || ''}
              onChange={(e) => onChange({ ...endpoint, operationId: e.target.value })}
              placeholder="getResourceById"
            />
          </div>
          
          <div>
            <Label className="text-sm mb-1.5 block">Tags</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {endpoint.tags.map(tag => (
                <Badge key={tag} variant="secondary" className="gap-1">
                  {tag}
                  <button onClick={() => handleRemoveTag(tag)} className="ml-1 hover:text-destructive">
                    ×
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="Add tag..."
                onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={handleAddTag}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Parameters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Parameters</CardTitle>
            <Button variant="outline" size="sm" onClick={handleAddParameter}>
              <Plus className="h-4 w-4 mr-1" />
              Add Parameter
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {endpoint.parameters.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No parameters defined. Click "Add Parameter" to add one.
            </p>
          ) : (
            <div className="space-y-3">
              {endpoint.parameters.map((param, index) => (
                <Card key={index} className="bg-muted/30">
                  <CardContent className="p-3 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <Input
                          value={param.name}
                          onChange={(e) => handleUpdateParameter(index, { ...param, name: e.target.value })}
                          placeholder="Parameter name"
                        />
                      </div>
                      <Select 
                        value={param.in} 
                        onValueChange={(v) => handleUpdateParameter(index, { ...param, in: v as typeof param.in })}
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PARAMETER_LOCATIONS.map(loc => (
                            <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-1">
                        <Switch
                          checked={param.required}
                          onCheckedChange={(v) => handleUpdateParameter(index, { ...param, required: v })}
                        />
                        <Label className="text-xs">Required</Label>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveParameter(index)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <Input
                      value={param.description || ''}
                      onChange={(e) => handleUpdateParameter(index, { ...param, description: e.target.value })}
                      placeholder="Description"
                      className="text-sm"
                    />
                    <SchemaEditor
                      schema={param.schema}
                      onChange={(schema) => handleUpdateParameter(index, { ...param, schema })}
                      schemaRefs={schemaRefs}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Request Body */}
      {['POST', 'PUT', 'PATCH'].includes(endpoint.method) && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Request Body</CardTitle>
              <div className="flex items-center gap-2">
                <Switch
                  checked={!!endpoint.requestBody}
                  onCheckedChange={handleToggleRequestBody}
                />
                <Label className="text-sm">Enabled</Label>
              </div>
            </div>
          </CardHeader>
          {endpoint.requestBody && (
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={endpoint.requestBody.required}
                  onCheckedChange={(v) => onChange({
                    ...endpoint,
                    requestBody: { ...endpoint.requestBody!, required: v }
                  })}
                />
                <Label className="text-sm">Required</Label>
              </div>
              <Input
                value={endpoint.requestBody.description || ''}
                onChange={(e) => onChange({
                  ...endpoint,
                  requestBody: { ...endpoint.requestBody!, description: e.target.value }
                })}
                placeholder="Description"
              />
              <div>
                <Label className="text-sm mb-2 block">Schema</Label>
                <SchemaEditor
                  schema={endpoint.requestBody.content?.['application/json']?.schema || { type: 'object' }}
                  onChange={(schema) => onChange({
                    ...endpoint,
                    requestBody: {
                      ...endpoint.requestBody!,
                      content: {
                        'application/json': {
                          ...endpoint.requestBody!.content?.['application/json'],
                          schema
                        }
                      }
                    }
                  })}
                  schemaRefs={schemaRefs}
                />
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Responses */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Responses</CardTitle>
            <Select onValueChange={handleAddResponse}>
              <SelectTrigger className="w-40">
                <Plus className="h-4 w-4 mr-1" />
                <span>Add Response</span>
              </SelectTrigger>
              <SelectContent>
                {HTTP_STATUS_CODES.filter(s => !endpoint.responses[s.code]).map(s => (
                  <SelectItem key={s.code} value={s.code}>
                    {s.code} - {s.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={Object.keys(endpoint.responses)[0] || '200'}>
            <TabsList className="mb-4">
              {Object.keys(endpoint.responses).sort().map(code => (
                <TabsTrigger key={code} value={code} className="gap-1">
                  <span className={`w-2 h-2 rounded-full ${
                    code.startsWith('2') ? 'bg-emerald-500' :
                    code.startsWith('4') ? 'bg-amber-500' :
                    code.startsWith('5') ? 'bg-red-500' : 'bg-blue-500'
                  }`} />
                  {code}
                </TabsTrigger>
              ))}
            </TabsList>
            
            {Object.entries(endpoint.responses).map(([code, response]) => (
              <TabsContent key={code} value={code} className="space-y-4">
                <div className="flex items-center justify-between">
                  <Input
                    value={response.description}
                    onChange={(e) => onChange({
                      ...endpoint,
                      responses: {
                        ...endpoint.responses,
                        [code]: { ...response, description: e.target.value }
                      }
                    })}
                    placeholder="Description"
                    className="flex-1 mr-2"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveResponse(code)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                
                {response.content?.['application/json'] && (
                  <>
                    <div>
                      <Label className="text-sm mb-2 block">Response Schema</Label>
                      <SchemaEditor
                        schema={response.content['application/json'].schema}
                        onChange={(schema) => onChange({
                          ...endpoint,
                          responses: {
                            ...endpoint.responses,
                            [code]: {
                              ...response,
                              content: {
                                'application/json': {
                                  ...response.content!['application/json'],
                                  schema
                                }
                              }
                            }
                          }
                        })}
                        schemaRefs={schemaRefs}
                      />
                    </div>
                    
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-sm">Response Example</Label>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => generateResponseExample(code)}
                          >
                            <Wand2 className="h-4 w-4 mr-1" />
                            Generate
                          </Button>
                          {response.content['application/json'].example && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyExample(response.content!['application/json']!.example)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <ScrollArea className="h-40 border rounded-md">
                        <pre className="p-3 text-xs font-mono">
                          {response.content['application/json'].example 
                            ? JSON.stringify(response.content['application/json'].example, null, 2)
                            : 'Click "Generate" to create an example from the schema'}
                        </pre>
                      </ScrollArea>
                    </div>
                  </>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};
