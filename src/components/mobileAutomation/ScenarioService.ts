/**
 * Purpose:
 * Provides CRUD (Create, Read, Update, Delete) operations for mobile automation scenarios.
 * Scenarios contain the sequence of recorded actions and target app metadata.
 */
import { supabase } from "@/integrations/supabase/client";

/**
 * Purpose: Represents a saved automation script/scenario.
 */
export interface RecordedScenario {
    id: string;
    name: string;
    description?: string;
    steps: any[]; // JSON stored steps
    app_package?: string;
    manual_script?: string | null;
    user_id?: string;
    created_at?: string;
    updated_at?: string;
}

// Note: nocodemobile_scenarios table may not exist in the current schema
// Using type casting to avoid TypeScript errors until the table is created
const SCENARIOS_TABLE = "nocodemobile_scenarios";

/**
 * Purpose: Service object for scenario management.
 */
export const ScenarioService = {
    isMissingScenarioTable(error: any): boolean {
        const msg = String(error?.message || "");
        const code = String(error?.code || "");
        return code === "PGRST205" || msg.includes("Could not find the table 'public.nocodemobile_scenarios'");
    },

    shouldRetryWithoutManualScript(error: any): boolean {
        const msg = String(error?.message || "");
        const code = String(error?.code || "");
        return (
            msg.includes("manual_script") &&
            (
                msg.includes("schema cache") ||
                msg.includes("column") ||
                code === "PGRST204" ||
                code === "42703"
            )
        );
    },
    /**
     * Purpose:
     * Retrieves all saved scenarios for the currently authenticated user.
     */
    async getScenarios() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return { success: false, error: "Not authenticated" };

            const { data, error } = await (supabase as any)
                .from(SCENARIOS_TABLE)
                .select("*")
                .eq("user_id", user.id)
                .order("created_at", { ascending: false });

            if (error) {
                if (ScenarioService.isMissingScenarioTable(error)) {
                    return {
                        success: false,
                        error: "Mobile scenarios table is not deployed. Apply Supabase migrations and retry.",
                    };
                }
                // Table might not exist yet
                console.warn("[ScenarioService] Table may not exist:", error.message);
                return { success: true, data: [] };
            }
            return { success: true, data };
        } catch (err: any) {
            console.error("[ScenarioService] Get error:", err);
            return { success: false, error: err.message };
        }
    },

    /**
     * Purpose:
     * Saves a new scenario or updates an existing one if an ID is provided.
     */
    async saveScenario(
        name: string,
        steps: any[],
        id?: string,
        description?: string,
        appPackage?: string,
        manualScript?: string | null
    ) {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return { success: false, error: "Not authenticated" };

            const payload: any = {
                name,
                description,
                steps,
                app_package: appPackage,
                manual_script: manualScript ?? null,
                user_id: user.id,
                updated_at: new Date().toISOString()
            };

            let result;

            if (id) {
                // Update existing
                result = await (supabase as any)
                    .from(SCENARIOS_TABLE)
                    .update(payload)
                    .eq("id", id)
                    .select()
                    .single();
            } else {
                // Insert new
                result = await (supabase as any)
                    .from(SCENARIOS_TABLE)
                    .insert(payload)
                    .select()
                    .single();
            }

            if (result.error && ScenarioService.shouldRetryWithoutManualScript(result.error)) {
                const fallbackPayload = { ...payload };
                delete fallbackPayload.manual_script;

                if (id) {
                    result = await (supabase as any)
                        .from(SCENARIOS_TABLE)
                        .update(fallbackPayload)
                        .eq("id", id)
                        .select()
                        .single();
                } else {
                    result = await (supabase as any)
                        .from(SCENARIOS_TABLE)
                        .insert(fallbackPayload)
                        .select()
                        .single();
                }
            }

            if (result.error) {
                if (ScenarioService.isMissingScenarioTable(result.error)) {
                    return {
                        success: false,
                        error: "Mobile scenarios table is not deployed. Run `supabase db push`.",
                    };
                }
                throw result.error;
            }
            return { success: true, data: result.data };

        } catch (err: any) {
            console.error("[ScenarioService] Save error:", err);
            return { success: false, error: err.message };
        }
    },

    async saveManualScript(id: string, manualScript: string) {
        try {
            const payload: any = {
                manual_script: manualScript,
                updated_at: new Date().toISOString(),
            };

            let result = await (supabase as any)
                .from(SCENARIOS_TABLE)
                .update(payload)
                .eq("id", id)
                .select()
                .single();

            if (result.error && ScenarioService.shouldRetryWithoutManualScript(result.error)) {
                // Column not available yet; treat as non-fatal for backward compatibility.
                return { success: false, error: "manual_script_column_missing" as const };
            }

            if (result.error) throw result.error;
            return { success: true, data: result.data };
        } catch (err: any) {
            console.error("[ScenarioService] Save manual script error:", err);
            return { success: false, error: err.message };
        }
    },

    /**
     * Purpose:
     * Deletes a scenario from the database by its ID.
     */
    async deleteScenario(id: string) {
        try {
            const { error } = await (supabase as any)
                .from(SCENARIOS_TABLE)
                .delete()
                .eq("id", id);

            if (error) {
                if (ScenarioService.isMissingScenarioTable(error)) {
                    return {
                        success: false,
                        error: "Mobile scenarios table is not deployed. Run `supabase db push`.",
                    };
                }
                throw error;
            }
            return { success: true };
        } catch (err: any) {
            console.error("[ScenarioService] Delete error:", err);
            return { success: false, error: err.message };
        }
    }
};
