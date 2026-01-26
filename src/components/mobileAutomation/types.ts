export interface CheckResult {
    status: "pending" | "checking" | "success" | "error";
    message: string;
}

export type ActionType =
    | "tap"
    | "input"
    | "scroll"
    | "wait"
    | "assert"
    | "openApp";

export interface RecordedAction {
    id: string;
    type: ActionType;
    description: string;
    locator: string;
    value?: string;
    enabled?: boolean;
    coordinates?: {
        x: number;
        y: number;
        endX?: number;
        endY?: number;
    };
    timestamp?: number;
    // Smart Recording Metadata
    elementId?: string;
    elementText?: string;
    elementClass?: string;
    elementContentDesc?: string;
}

export interface DeviceInfo {
    id: string;
    name?: string;
    type: "emulator" | "real";
    os_version?: string;
}

export interface SelectedDevice {
    id?: string;
    device: string;
    name?: string;
    os_version: string;
    real_mobile: boolean;
}
