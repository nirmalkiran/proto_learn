import { supabase } from "@/integrations/supabase/client";

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

export const ScenarioService = {
    /**
     * Get all saved scenarios for the current user
     */
    async getScenarios() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return { success: false, error: "Not authenticated" };

            const { data, error } = await supabase
                .from("nocodemobile_scenarios")
                .select("*")
                .eq("user_id", user.id)
                .order("created_at", { ascending: false });

            if (error) throw error;
            return { success: true, data };
        } catch (err: any) {
            console.error("[ScenarioService] Get error:", err);
            return { success: false, error: err.message };
        }
    },

    /**
     * Save a new scenario or update existing if ID provided
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

            let query = supabase.from("nocodemobile_scenarios");
            let result;

            if (id) {
                // Update existing
                result = await query.update(payload).eq("id", id).select().single();
            } else {
                // Insert new
                result = await query.insert(payload).select().single();
            }

            if (result.error) throw result.error;
            return { success: true, data: result.data };

        } catch (err: any) {
            console.error("[ScenarioService] Save error:", err);
            return { success: false, error: err.message };
        }
    },

    /**
     * Delete a scenario
     */
    async deleteScenario(id: string) {
        try {
            const { error } = await supabase
                .from("nocodemobile_scenarios")
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
