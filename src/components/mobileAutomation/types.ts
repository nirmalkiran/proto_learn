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

export type LocatorStrategy =
    | "accessibilityId"
    | "id"
    | "text"
    | "xpath"
    | "androidUiAutomator"
    | "coordinates";

export interface LocatorCandidate {
    strategy: LocatorStrategy;
    value: string;
    score: number; // 0-100
    source?: "inspector" | "healer" | "legacy";
    reason?: string;
}

export interface LocatorBundleV1 {
    version: 1;
    fingerprint: string;
    primary: LocatorCandidate;
    fallbacks: LocatorCandidate[];
}

export interface ScreenContext {
    package?: string;
    activity?: string;
    window?: string;
    ts?: number;
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
    /** Optional derived XPath for script generation (fallback after id/a11y/text) */
    xpath?: string;
    /** How `locator` should be interpreted (when present) */
    locatorStrategy?: "id" | "accessibilityId" | "text" | "xpath" | "coordinates" | "";
    /** Inspector-first locator bundle (preferred) */
    locatorBundle?: LocatorBundleV1 | null;
    /** 0-100 confidence of locator stability */
    reliabilityScore?: number;
    /** Snapshot reference for hierarchy diffs/healing */
    hierarchySnapshotId?: string | null;
    /** Resilient XPath (in addition to legacy `xpath`) */
    smartXPath?: string;
    /** Deterministic fingerprint of the element (healing key) */
    elementFingerprint?: string;
    /** Screen context (best-effort) */
    screenContext?: ScreenContext | null;
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
