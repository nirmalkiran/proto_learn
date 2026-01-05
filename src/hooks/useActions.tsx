import { useState, useCallback } from "react";
import { toast } from "sonner";

export type ActionType =
  | "tap"
  | "input"
  | "scroll"
  | "wait"
  | "assert";

export interface RecordedAction {
  id: string;
  type: ActionType;
  description: string;
  locator: string;
  value?: string;
  coordinates?: {
    x: number;
    y: number;
    endX?: number;
    endY?: number;
  };
  timestamp?: number;
  enabled: boolean;
}

const AGENT_URL = "http://localhost:3001";

export function useActions() {
  const [actions, setActions] = useState<RecordedAction[]>([]);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const [editingLocatorId, setEditingLocatorId] = useState<string | null>(null);
  const [editingLocatorValue, setEditingLocatorValue] = useState<string>("");
  const [previewPendingId, setPreviewPendingId] = useState<string | null>(null);

  const addAction = useCallback((action: RecordedAction) => {
    setActions((prev) => [...prev, action]);
    toast.info(`Captured: ${action.description}`);
  }, []);

  const updateAction = useCallback((id: string, updates: Partial<RecordedAction>) => {
    setActions((prev) => prev.map((action) =>
      action.id === id ? { ...action, ...updates } : action
    ));
  }, []);

  const deleteAction = useCallback((id: string) => {
    setActions((prev) => prev.filter((action) => action.id !== id));
  }, []);

  const toggleActionEnabled = useCallback((id: string) => {
    setActions((prev) => prev.map((action) =>
      action.id === id ? { ...action, enabled: !action.enabled } : action
    ));
  }, []);

  const reorderActions = useCallback((fromIndex: number, toIndex: number) => {
    setActions((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(fromIndex, 1);
      copy.splice(toIndex, 0, moved);
      return copy;
    });
    toast.success("Step reordered");
  }, []);

  const startEditingValue = useCallback((id: string, currentValue: string = "") => {
    setEditingStepId(id);
    setEditingValue(currentValue);
  }, []);

  const saveEditingValue = useCallback(() => {
    if (!editingStepId) return;
    updateAction(editingStepId, { value: editingValue });
    setEditingStepId(null);
    setEditingValue("");
    toast.success("Step value updated");
  }, [editingStepId, editingValue, updateAction]);

  const cancelEditingValue = useCallback(() => {
    setEditingStepId(null);
    setEditingValue("");
  }, []);

  const startEditingLocator = useCallback((id: string, currentLocator: string) => {
    setEditingLocatorId(id);
    setEditingLocatorValue(currentLocator);
  }, []);

  const saveEditingLocator = useCallback(() => {
    if (!editingLocatorId) return;
    updateAction(editingLocatorId, { locator: editingLocatorValue });
    setEditingLocatorId(null);
    toast.success("Locator updated");
  }, [editingLocatorId, editingLocatorValue, updateAction]);

  const cancelEditingLocator = useCallback(() => {
    setEditingLocatorId(null);
  }, []);

  const previewInput = useCallback(async (action: RecordedAction, overrideValue?: string) => {
    const text = (typeof overrideValue !== 'undefined') ? overrideValue : action.value;
    if (!text || String(text).trim().length === 0) {
      toast.error("No value to preview");
      return;
    }

    if (!action.coordinates || typeof action.coordinates.x !== 'number' || typeof action.coordinates.y !== 'number') {
      toast.error("No coordinates available for this step");
      return;
    }

    try {
      setPreviewPendingId(action.id);
      const r = await fetch(`${AGENT_URL}/device/input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: action.coordinates.x, y: action.coordinates.y, text }),
      });

      if (!r.ok) {
        const jj = await r.json().catch(() => ({}));
        toast.error(jj.error || 'Failed to send preview input');
      } else {
        toast.success('Preview input sent to device');
      }
    } catch (err) {
      console.error('Preview input failed:', err);
      toast.error('Failed to send preview input');
    } finally {
      setPreviewPendingId(null);
    }
  }, []);

  const clearActions = useCallback(() => {
    setActions([]);
  }, []);

  const saveTestCase = useCallback(async () => {
    if (actions.length === 0) {
      toast.error("No steps to save");
      return false;
    }

    try {
      const res = await fetch("http://localhost:3001/testcases/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Recorded_Test_${Date.now()}`,
          steps: actions,
        }),
      });

      const data = await res.json();

      if (!data.success) throw new Error();

      toast.success("Test case saved successfully");
      return true;
    } catch {
      toast.error("Failed to save test case");
      return false;
    }
  }, [actions]);

  return {
    actions,
    editingStepId,
    editingValue,
    editingLocatorId,
    editingLocatorValue,
    previewPendingId,
    addAction,
    updateAction,
    deleteAction,
    toggleActionEnabled,
    reorderActions,
    startEditingValue,
    saveEditingValue,
    cancelEditingValue,
    startEditingLocator,
    saveEditingLocator,
    cancelEditingLocator,
    previewInput,
    clearActions,
    saveTestCase,
  };
}
