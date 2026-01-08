import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Edit2, Copy, Database } from "lucide-react";
import { SchemaRef, SchemaObject } from "./types";
import { SchemaEditor } from "./SchemaEditor";

interface SchemaRefManagerProps {
  schemaRefs: SchemaRef[];
  onChange: (refs: SchemaRef[]) => void;
}

export const SchemaRefManager = ({ schemaRefs, onChange }: SchemaRefManagerProps) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRef, setEditingRef] = useState<SchemaRef | null>(null);
  const [newRefName, setNewRefName] = useState("");
  const [newRefSchema, setNewRefSchema] = useState<SchemaObject>({ type: 'object', properties: {} });

  const handleAddRef = () => {
    setEditingRef(null);
    setNewRefName("");
    setNewRefSchema({ type: 'object', properties: {} });
    setIsDialogOpen(true);
  };

  const handleEditRef = (ref: SchemaRef) => {
    setEditingRef(ref);
    setNewRefName(ref.name);
    setNewRefSchema(ref.schema);
    setIsDialogOpen(true);
  };

  const handleSaveRef = () => {
    if (!newRefName.trim()) return;

    if (editingRef) {
      // Update existing
      onChange(schemaRefs.map(r => 
        r.name === editingRef.name 
          ? { name: newRefName.trim(), schema: newRefSchema }
          : r
      ));
    } else {
      // Add new
      if (schemaRefs.some(r => r.name === newRefName.trim())) {
        return; // Name already exists
      }
      onChange([...schemaRefs, { name: newRefName.trim(), schema: newRefSchema }]);
    }

    setIsDialogOpen(false);
    setEditingRef(null);
    setNewRefName("");
    setNewRefSchema({ type: 'object', properties: {} });
  };

  const handleDeleteRef = (name: string) => {
    onChange(schemaRefs.filter(r => r.name !== name));
  };

  const handleDuplicateRef = (ref: SchemaRef) => {
    let newName = `${ref.name}_copy`;
    let counter = 1;
    while (schemaRefs.some(r => r.name === newName)) {
      newName = `${ref.name}_copy_${counter}`;
      counter++;
    }
    onChange([...schemaRefs, { name: newName, schema: JSON.parse(JSON.stringify(ref.schema)) }]);
  };

  const commonSchemas: Array<{ name: string; schema: SchemaObject }> = [
    {
      name: 'ApiResponse',
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Operation completed successfully' },
          data: { type: 'object', properties: {} }
        },
        required: ['success']
      }
    },
    {
      name: 'PaginatedResponse',
      schema: {
        type: 'object',
        properties: {
          items: { type: 'array', items: { type: 'object' } },
          total: { type: 'integer', example: 100 },
          page: { type: 'integer', example: 1 },
          pageSize: { type: 'integer', example: 10 },
          hasNext: { type: 'boolean', example: true }
        },
        required: ['items', 'total', 'page', 'pageSize']
      }
    },
    {
      name: 'Error',
      schema: {
        type: 'object',
        properties: {
          code: { type: 'string', example: 'ERR_001' },
          message: { type: 'string', example: 'An error occurred' },
          details: { type: 'object', properties: {} }
        },
        required: ['code', 'message']
      }
    },
    {
      name: 'User',
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          name: { type: 'string', example: 'John Doe' },
          createdAt: { type: 'string', format: 'date-time' }
        },
        required: ['id', 'email']
      }
    }
  ];

  const handleAddCommonSchema = (schema: typeof commonSchemas[0]) => {
    let name = schema.name;
    let counter = 1;
    while (schemaRefs.some(r => r.name === name)) {
      name = `${schema.name}_${counter}`;
      counter++;
    }
    onChange([...schemaRefs, { name, schema: JSON.parse(JSON.stringify(schema.schema)) }]);
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Database className="h-5 w-5" />
              Schema Components
            </CardTitle>
            <Button variant="outline" size="sm" onClick={handleAddRef}>
              <Plus className="h-4 w-4 mr-1" />
              New Schema
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {schemaRefs.length === 0 ? (
            <div className="text-center py-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                No schemas defined. Add reusable schemas to reference in your API endpoints.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {commonSchemas.map(schema => (
                  <Button 
                    key={schema.name}
                    variant="outline" 
                    size="sm"
                    onClick={() => handleAddCommonSchema(schema)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    {schema.name}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {schemaRefs.map(ref => (
                  <div 
                    key={ref.name}
                    className="flex items-center justify-between p-3 border rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div>
                      <span className="font-medium text-sm">{ref.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        ({ref.schema.type})
                      </span>
                      {ref.schema.properties && (
                        <span className="text-xs text-muted-foreground ml-1">
                          - {Object.keys(ref.schema.properties).length} properties
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDuplicateRef(ref)}
                        className="h-7 w-7 p-0"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditRef(ref)}
                        className="h-7 w-7 p-0"
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteRef(ref.name)}
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingRef ? 'Edit Schema' : 'Create New Schema'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label className="text-sm mb-1.5 block">Schema Name</Label>
              <Input
                value={newRefName}
                onChange={(e) => setNewRefName(e.target.value)}
                placeholder="e.g., User, Product, Order"
              />
            </div>
            
            <div>
              <Label className="text-sm mb-2 block">Schema Definition</Label>
              <SchemaEditor
                schema={newRefSchema}
                onChange={setNewRefSchema}
                schemaRefs={schemaRefs.filter(r => r.name !== editingRef?.name)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveRef} disabled={!newRefName.trim()}>
              {editingRef ? 'Update Schema' : 'Create Schema'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
