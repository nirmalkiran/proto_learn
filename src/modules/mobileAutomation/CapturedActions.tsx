import { Play, Trash2, GripVertical, ToggleLeft, ToggleRight, Edit2, Check, X } from "lucide-react";
import { useState } from "react";
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

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export interface RecordedAction {
  id: string;
  type: string;
  description: string;
  locator?: string;
  coordinates?: { x: number; y: number };
  value?: string;
  enabled?: boolean;
}

interface SortableItemProps {
  action: RecordedAction;
  index: number;
  editingIndex: number | null;
  editingLocator: string;
  onToggle: (index: number) => void;
  onDelete: (index: number) => void;
  onStartEdit: (index: number, locator: string) => void;
  onSaveLocator: (index: number) => void;
  onCancelEdit: () => void;
  onLocatorChange: (value: string) => void;
}

function SortableItem({
  action,
  index,
  editingIndex,
  editingLocator,
  onToggle,
  onDelete,
  onStartEdit,
  onSaveLocator,
  onCancelEdit,
  onLocatorChange,
}: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: action.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 p-2 rounded border ${
        action.enabled === false ? "opacity-50 bg-muted/50" : "bg-card"
      } ${isDragging ? "shadow-lg ring-2 ring-primary" : ""}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="p-1 h-auto"
        onClick={() => onToggle(index)}
      >
        {action.enabled === false ? (
          <ToggleLeft className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ToggleRight className="h-4 w-4 text-primary" />
        )}
      </Button>

      <Badge variant="secondary" className="text-xs">
        {action.type}
      </Badge>

      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{action.description}</p>
        {editingIndex === index ? (
          <div className="flex items-center gap-1 mt-1">
            <Input
              value={editingLocator}
              onChange={(e) => onLocatorChange(e.target.value)}
              className="h-6 text-xs"
              placeholder="Locator"
            />
            <Button
              variant="ghost"
              size="sm"
              className="p-1 h-6"
              onClick={() => onSaveLocator(index)}
            >
              <Check className="h-3 w-3 text-green-500" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="p-1 h-6"
              onClick={onCancelEdit}
            >
              <X className="h-3 w-3 text-destructive" />
            </Button>
          </div>
        ) : action.locator ? (
          <div className="flex items-center gap-1">
            <p className="text-xs text-muted-foreground truncate">
              {action.locator}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="p-0.5 h-auto"
              onClick={() => onStartEdit(index, action.locator || "")}
            >
              <Edit2 className="h-3 w-3" />
            </Button>
          </div>
        ) : null}
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="p-1 h-auto text-destructive"
        onClick={() => onDelete(index)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

interface CapturedActionsProps {
  actions: RecordedAction[];
  setActions: React.Dispatch<React.SetStateAction<RecordedAction[]>>;
  onReplay: () => void;
  isReplaying: boolean;
}

export default function CapturedActions({
  actions,
  setActions,
  onReplay,
  isReplaying,
}: CapturedActionsProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingLocator, setEditingLocator] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setActions((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const toggleAction = (index: number) => {
    setActions((prev) =>
      prev.map((action, i) =>
        i === index ? { ...action, enabled: !action.enabled } : action
      )
    );
  };

  const deleteAction = (index: number) => {
    setActions((prev) => prev.filter((_, i) => i !== index));
  };

  const startEditing = (index: number, locator: string) => {
    setEditingIndex(index);
    setEditingLocator(locator || "");
  };

  const saveLocator = (index: number) => {
    setActions((prev) =>
      prev.map((action, i) =>
        i === index ? { ...action, locator: editingLocator } : action
      )
    );
    setEditingIndex(null);
    setEditingLocator("");
  };

  const cancelEditing = () => {
    setEditingIndex(null);
    setEditingLocator("");
  };

  const enabledCount = actions.filter((a) => a.enabled !== false).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          Recorded Actions
          <Badge variant="outline">{enabledCount}/{actions.length} enabled</Badge>
        </CardTitle>
        {actions.length > 0 && (
          <Button
            size="sm"
            onClick={onReplay}
            disabled={isReplaying || enabledCount === 0}
          >
            <Play className="h-4 w-4 mr-1" />
            {isReplaying ? "Replaying..." : "Replay"}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {actions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No actions recorded yet</p>
            <p className="text-sm">Start recording to capture actions</p>
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={actions.map((a) => a.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {actions.map((action, index) => (
                    <SortableItem
                      key={action.id}
                      action={action}
                      index={index}
                      editingIndex={editingIndex}
                      editingLocator={editingLocator}
                      onToggle={toggleAction}
                      onDelete={deleteAction}
                      onStartEdit={startEditing}
                      onSaveLocator={saveLocator}
                      onCancelEdit={cancelEditing}
                      onLocatorChange={setEditingLocator}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}