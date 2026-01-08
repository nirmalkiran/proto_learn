import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { SchemaObject, SCHEMA_TYPES, STRING_FORMATS, NUMBER_FORMATS, SchemaRef } from "./types";

interface SchemaEditorProps {
  schema: SchemaObject;
  onChange: (schema: SchemaObject) => void;
  schemaRefs?: SchemaRef[];
  level?: number;
  propertyName?: string;
}

export const SchemaEditor = ({ 
  schema, 
  onChange, 
  schemaRefs = [], 
  level = 0,
  propertyName 
}: SchemaEditorProps) => {
  const [isExpanded, setIsExpanded] = useState(level < 2);
  const [newPropertyName, setNewPropertyName] = useState("");

  const handleTypeChange = (type: string) => {
    const newSchema: SchemaObject = { ...schema, type: type as SchemaObject['type'] };
    
    // Reset type-specific fields
    delete newSchema.items;
    delete newSchema.properties;
    delete newSchema.enum;
    delete newSchema.format;
    
    if (type === 'array') {
      newSchema.items = { type: 'string' };
    } else if (type === 'object') {
      newSchema.properties = {};
    }
    
    onChange(newSchema);
  };

  const handleAddProperty = () => {
    if (!newPropertyName.trim() || !schema.properties) return;
    
    onChange({
      ...schema,
      properties: {
        ...schema.properties,
        [newPropertyName.trim()]: { type: 'string' }
      }
    });
    setNewPropertyName("");
  };

  const handleRemoveProperty = (propName: string) => {
    if (!schema.properties) return;
    
    const { [propName]: _, ...rest } = schema.properties;
    const newRequired = schema.required?.filter(r => r !== propName);
    
    onChange({
      ...schema,
      properties: rest,
      required: newRequired?.length ? newRequired : undefined
    });
  };

  const handlePropertyChange = (propName: string, propSchema: SchemaObject) => {
    onChange({
      ...schema,
      properties: {
        ...schema.properties,
        [propName]: propSchema
      }
    });
  };

  const toggleRequired = (propName: string) => {
    const currentRequired = schema.required || [];
    const isRequired = currentRequired.includes(propName);
    
    onChange({
      ...schema,
      required: isRequired 
        ? currentRequired.filter(r => r !== propName)
        : [...currentRequired, propName]
    });
  };

  const handleRefSelect = (refName: string) => {
    if (refName === 'none') {
      const { $ref, ...rest } = schema;
      onChange({ ...rest, type: 'object' });
    } else {
      onChange({ $ref: `#/components/schemas/${refName}` });
    }
  };

  const renderFormatSelect = () => {
    if (schema.type === 'string') {
      return (
        <Select 
          value={schema.format || 'none'} 
          onValueChange={(v) => onChange({ ...schema, format: v === 'none' ? undefined : v })}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Format" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {STRING_FORMATS.map(f => (
              <SelectItem key={f} value={f}>{f}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    
    if (schema.type === 'number' || schema.type === 'integer') {
      return (
        <Select 
          value={schema.format || 'none'} 
          onValueChange={(v) => onChange({ ...schema, format: v === 'none' ? undefined : v })}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Format" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {NUMBER_FORMATS.map(f => (
              <SelectItem key={f} value={f}>{f}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    
    return null;
  };

  // If using a reference
  if (schema.$ref) {
    const refName = schema.$ref.replace('#/components/schemas/', '');
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Ref:</span>
        <Select value={refName} onValueChange={handleRefSelect}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">-- No Ref --</SelectItem>
            {schemaRefs.map(ref => (
              <SelectItem key={ref.name} value={ref.name}>{ref.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${level > 0 ? 'pl-4 border-l-2 border-muted' : ''}`}>
      <div className="flex items-center gap-2 flex-wrap">
        {schema.type === 'object' && Object.keys(schema.properties || {}).length > 0 && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="p-1 h-6 w-6"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        )}
        
        <Select value={schema.type} onValueChange={handleTypeChange}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCHEMA_TYPES.map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        {renderFormatSelect()}
        
        {schemaRefs.length > 0 && (
          <Select value="none" onValueChange={handleRefSelect}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Use Ref" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">-- Use Ref --</SelectItem>
              {schemaRefs.map(ref => (
                <SelectItem key={ref.name} value={ref.name}>{ref.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        
        <Input
          placeholder="Example value"
          value={schema.example?.toString() || ''}
          onChange={(e) => onChange({ ...schema, example: e.target.value || undefined })}
          className="w-32"
        />
      </div>
      
      <Input
        placeholder="Description"
        value={schema.description || ''}
        onChange={(e) => onChange({ ...schema, description: e.target.value || undefined })}
        className="text-sm"
      />
      
      {/* Array items */}
      {schema.type === 'array' && schema.items && (
        <Card className="bg-muted/30">
          <CardContent className="p-3">
            <Label className="text-xs text-muted-foreground mb-2 block">Array Items</Label>
            <SchemaEditor 
              schema={schema.items} 
              onChange={(items) => onChange({ ...schema, items })}
              schemaRefs={schemaRefs}
              level={level + 1}
            />
          </CardContent>
        </Card>
      )}
      
      {/* Object properties */}
      {schema.type === 'object' && isExpanded && (
        <div className="space-y-2">
          {Object.entries(schema.properties || {}).map(([propName, propSchema]) => (
            <Card key={propName} className="bg-muted/20">
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{propName}</span>
                    <div className="flex items-center gap-1">
                      <Switch
                        checked={schema.required?.includes(propName) || false}
                        onCheckedChange={() => toggleRequired(propName)}
                        className="scale-75"
                      />
                      <span className="text-xs text-muted-foreground">required</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveProperty(propName)}
                    className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <SchemaEditor 
                  schema={propSchema} 
                  onChange={(s) => handlePropertyChange(propName, s)}
                  schemaRefs={schemaRefs}
                  level={level + 1}
                  propertyName={propName}
                />
              </CardContent>
            </Card>
          ))}
          
          <div className="flex gap-2">
            <Input
              placeholder="New property name"
              value={newPropertyName}
              onChange={(e) => setNewPropertyName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddProperty()}
              className="flex-1"
            />
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleAddProperty}
              disabled={!newPropertyName.trim()}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Property
            </Button>
          </div>
        </div>
      )}
      
      {/* Enum values for string */}
      {schema.type === 'string' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Switch
              checked={Array.isArray(schema.enum)}
              onCheckedChange={(checked) => {
                if (checked) {
                  onChange({ ...schema, enum: [] });
                } else {
                  const { enum: _, ...rest } = schema;
                  onChange(rest);
                }
              }}
            />
            <Label className="text-sm">Has enum values</Label>
          </div>
          {schema.enum && (
            <Textarea
              placeholder="Enter enum values, one per line"
              value={schema.enum.join('\n')}
              onChange={(e) => onChange({ 
                ...schema, 
                enum: e.target.value.split('\n').filter(v => v.trim())
              })}
              rows={3}
            />
          )}
        </div>
      )}
    </div>
  );
};
