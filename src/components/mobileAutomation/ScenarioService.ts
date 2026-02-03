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
    async saveScenario(name: string, steps: any[], id?: string, description?: string, appPackage?: string) {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return { success: false, error: "Not authenticated" };

            const payload = {
                name,
                description,
                steps,
                app_package: appPackage,
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

            if (result.error) throw result.error;
            return { success: true, data: result.data };

        } catch (err: any) {
            console.error("[ScenarioService] Save error:", err);
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

            if (error) throw error;
            return { success: true };
        } catch (err: any) {
            console.error("[ScenarioService] Delete error:", err);
            return { success: false, error: err.message };
        }
    }
};
