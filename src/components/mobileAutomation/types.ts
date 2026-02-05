/**
 * Purpose: Represents the status of a system check (e.g., Appium, Agent).
 */
export interface CheckResult {
    status: "pending" | "checking" | "success" | "error";
    message: string;
}

/**
 * Purpose: Supported user interaction and system action types for mobile automation.
 */
export type ActionType =
    | "tap"
    | "doubleTap"
    | "longPress"
    | "input"
    | "scroll"
    | "swipe"
    | "wait"
    | "assert"
    | "openApp"
    | "stopApp"
    | "clearCache"
    | "hideKeyboard"
    | "pressKey"
    // Backward-compatible: some agent steps emit extra types
    | "uninstallApp";

export interface ElementMetadata {
    resourceId?: string;
    text?: string;
    class?: string;
    contentDesc?: string;
    bounds?: string;
}

/**
 * Purpose: Represents a single recorded user interaction or system command.
 * Used during recording, replay, and script generation.
 */
export interface RecordedAction {
    id: string; // Unique identifier for the action
    type: ActionType; // Type of action to perform
    description: string; // Human-readable description
    locator: string; // Strategy to find the element (XPath, ID, etc.)
    value?: string; // Optional value (e.g., text for input)
    enabled?: boolean; // Whether the action should be executed
    coordinates?: {
        x: number;
        y: number;
        endX?: number;
        endY?: number;
    };
    timestamp?: number;
    /** Metadata for intelligent element matching */
    elementId?: string;
    elementText?: string;
    elementClass?: string;
    elementContentDesc?: string;
    /** Raw metadata from the agent (optional, backward-compatible) */
    elementMetadata?: ElementMetadata | null;
    /** Assertion configurations */
    assertionType?: "visible" | "text_equals" | "enabled" | "disabled" | "toast" | "screen_loaded";
}

/**
 * Purpose: Basic information about an available Android device or emulator.
 */
export interface DeviceInfo {
    id: string; // ADB serial or AVD name
    name?: string; // Friendly name
    type: "emulator" | "real";
    os_version?: string;
}

/**
 * Purpose: Tracking the currently selected device and its connection details.
 */
export interface SelectedDevice {
    id?: string;
    device: string; // ADB serial or AVD name
    name?: string;
    os_version: string;
    real_mobile: boolean;
}
