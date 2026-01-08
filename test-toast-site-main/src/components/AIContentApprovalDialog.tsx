import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, CheckCircle, XCircle, Edit3, Shield, ChevronDown, ChevronUp, Code, FileText, Bug, Wand2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export type ArtifactType = 
  | "test_case" 
  | "automation_script" 
  | "api_test_case" 
  | "defect_report" 
  | "nocode_steps" 
  | "elements" 
  | "manual_conversion";

interface AIContentApprovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  artifactType: ArtifactType;
  items: any[];
  confidence: number;
  warnings: string[];
  onApprove: (approvedItems: any[]) => void;
  onReject: (reason: string) => void;
  isProcessing?: boolean;
  renderItem?: (item: any, index: number, isEditing: boolean, onEdit: (field: string, value: any) => void) => React.ReactNode;
  getItemTitle?: (item: any) => string;
  getItemDescription?: (item: any) => string;
}

const artifactTypeLabels: Record<ArtifactType, { title: string; description: string; icon: React.ReactNode }> = {
  test_case: {
    title: "Test Cases",
    description: "AI-generated test cases require human review before saving.",
    icon: <FileText className="h-5 w-5" />,
  },
  automation_script: {
    title: "Automation Script",
    description: "AI-generated automation code requires human review before use.",
    icon: <Code className="h-5 w-5" />,
  },
  api_test_case: {
    title: "API Test Cases",
    description: "AI-generated API test cases require human review before saving.",
    icon: <Wand2 className="h-5 w-5" />,
  },
  defect_report: {
    title: "Defect Report",
    description: "AI-generated defect report requires human review before submission.",
    icon: <Bug className="h-5 w-5" />,
  },
  nocode_steps: {
    title: "Test Steps",
    description: "AI-generated test steps require human review before saving.",
    icon: <FileText className="h-5 w-5" />,
  },
  elements: {
    title: "Page Elements",
    description: "AI-extracted page elements require human review before use.",
    icon: <Code className="h-5 w-5" />,
  },
  manual_conversion: {
    title: "Converted Steps",
    description: "AI-converted automation steps require human review before saving.",
    icon: <Wand2 className="h-5 w-5" />,
  },
};

export const AIContentApprovalDialog = ({
  open,
  onOpenChange,
  artifactType,
  items,
  confidence,
  warnings,
  onApprove,
  onReject,
  isProcessing = false,
  renderItem,
  getItemTitle = (item) => item.title || item.name || "Item",
  getItemDescription = (item) => item.description || "",
}: AIContentApprovalDialogProps) => {
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set(items.map((_, index) => index)));
  const [editedItems, setEditedItems] = useState<Map<number, any>>(new Map());
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set([0]));
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const artifactInfo = artifactTypeLabels[artifactType];

  const getConfidenceColor = (conf: number) => {
    if (conf >= 0.85) return "text-success";
    if (conf >= 0.5) return "text-warning";
    return "text-destructive";
  };

  const getConfidenceBadge = (conf: number) => {
    if (conf >= 0.85) return "bg-success/20 text-success";
    if (conf >= 0.5) return "bg-warning/20 text-warning";
    return "bg-destructive/20 text-destructive";
  };

  const handleToggleSelect = (index: number) => {
    setSelectedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedItems.size === items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(items.map((_, index) => index)));
    }
  };

  const handleToggleExpand = (index: number) => {
    setExpandedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const handleEditItem = (index: number, field: string, value: any) => {
    const currentItem = editedItems.get(index) || items[index];
    const updated = { ...currentItem, [field]: value };
    setEditedItems((prev) => new Map(prev).set(index, updated));
  };

  const getItem = (index: number): any => {
    return editedItems.get(index) || items[index];
  };

  const handleApprove = () => {
    const approvedItems = Array.from(selectedItems)
      .map((index) => getItem(index))
      .filter(Boolean);
    onApprove(approvedItems);
  };

  const handleReject = () => {
    onReject(rejectReason);
    setRejectDialogOpen(false);
    setRejectReason("");
  };

  // Default render for simple items
  const defaultRenderItem = (item: any, index: number, isEditing: boolean, onEdit: (field: string, value: any) => void) => {
    if (isEditing) {
      return (
        <div className="space-y-3 pt-3">
          <div>
            <Label>Title</Label>
            <Input
              value={item.title || item.name || ""}
              onChange={(e) => onEdit("title", e.target.value)}
            />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              value={item.description || ""}
              onChange={(e) => onEdit("description", e.target.value)}
            />
          </div>
          {item.content && (
            <div>
              <Label>Content</Label>
              <Textarea
                value={typeof item.content === "string" ? item.content : JSON.stringify(item.content, null, 2)}
                onChange={(e) => onEdit("content", e.target.value)}
                rows={6}
                className="font-mono text-sm"
              />
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-2 pt-3">
        {item.description && (
          <div>
            <p className="text-xs text-muted-foreground font-medium">Description</p>
            <p className="text-sm">{item.description}</p>
          </div>
        )}
        {item.content && (
          <div>
            <p className="text-xs text-muted-foreground font-medium">Content</p>
            <pre className="text-sm bg-muted p-2 rounded overflow-auto max-h-40">
              {typeof item.content === "string" ? item.content : JSON.stringify(item.content, null, 2)}
            </pre>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Review AI-Generated {artifactInfo.title}
            </DialogTitle>
            <DialogDescription>{artifactInfo.description}</DialogDescription>
          </DialogHeader>

          {/* Confidence and Warnings */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">AI Confidence:</span>
              <Badge className={getConfidenceBadge(confidence)}>{(confidence * 100).toFixed(0)}%</Badge>
            </div>
            {items.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {selectedItems.size} of {items.length} selected
                </span>
                <Button variant="outline" size="sm" onClick={handleSelectAll}>
                  {selectedItems.size === items.length ? "Deselect All" : "Select All"}
                </Button>
              </div>
            )}
          </div>

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
                <div className="space-y-1">
                  {warnings.map((warning, index) => (
                    <p key={index} className="text-sm text-warning">
                      {warning}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Items List */}
          <ScrollArea className="flex-1 min-h-0 max-h-[400px] overflow-auto">
            <div className="space-y-2 pr-4">
              {items.map((item, index) => {
                const currentItem = getItem(index);
                const isSelected = selectedItems.has(index);
                const isExpanded = expandedItems.has(index);
                const isEditing = editingIndex === index;

                return (
                  <Collapsible key={index} open={isExpanded}>
                    <div
                      className={`border rounded-lg transition-colors ${
                        isSelected ? "border-primary bg-primary/5" : "border-border"
                      }`}
                    >
                      <div className="flex items-center gap-3 p-3">
                        {items.length > 1 && (
                          <Checkbox checked={isSelected} onCheckedChange={() => handleToggleSelect(index)} />
                        )}
                        <CollapsibleTrigger
                          className="flex-1 flex items-center justify-between cursor-pointer"
                          onClick={() => handleToggleExpand(index)}
                        >
                          <div className="flex-1 text-left">
                            <p className="font-medium">{getItemTitle(currentItem)}</p>
                            {getItemDescription(currentItem) && (
                              <p className="text-sm text-muted-foreground line-clamp-1">{getItemDescription(currentItem)}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {currentItem.priority && (
                              <Badge variant="outline">{currentItem.priority}</Badge>
                            )}
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </div>
                        </CollapsibleTrigger>
                        <Button variant="ghost" size="sm" onClick={() => setEditingIndex(isEditing ? null : index)}>
                          <Edit3 className="h-4 w-4" />
                        </Button>
                      </div>

                      <CollapsibleContent>
                        <div className="px-3 pb-3 pt-0 border-t">
                          {renderItem 
                            ? renderItem(currentItem, index, isEditing, (field, value) => handleEditItem(index, field, value))
                            : defaultRenderItem(currentItem, index, isEditing, (field, value) => handleEditItem(index, field, value))
                          }
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })}
            </div>
          </ScrollArea>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setRejectDialogOpen(true)} disabled={isProcessing}>
              <XCircle className="h-4 w-4 mr-2" />
              Reject All
            </Button>
            <Button onClick={handleApprove} disabled={selectedItems.size === 0 || isProcessing}>
              <CheckCircle className="h-4 w-4 mr-2" />
              {isProcessing ? "Processing..." : items.length > 1 ? `Approve ${selectedItems.size} Item(s)` : "Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Reason Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {artifactInfo.title}</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting this AI-generated content. This feedback helps improve future
              generations.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Reason for rejection</Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g., Content is incorrect, missing important details, needs manual adjustment..."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReject}>
              Reject All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
