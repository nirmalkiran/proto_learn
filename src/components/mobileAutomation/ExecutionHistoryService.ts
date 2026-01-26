import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);

export interface ExecutionResult {
    status: "SUCCESS" | "FAILED";
    test_id?: string;
    suite_id?: string;
    projectId?: string;
    duration_ms?: number;
    error_message?: string;
    failed_step_index?: number;
    results?: any;
}

export const ExecutionHistoryService = {
    /**
     * Saves a test execution result to Supabase
     */
    async saveTestExecution(result: ExecutionResult) {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return null;

            const payload: any = {
                test_id: result.test_id,
                status: result.status,
                started_at: new Date(Date.now() - (result.duration_ms || 0)).toISOString(),
                completed_at: new Date().toISOString(),
                duration_ms: result.duration_ms,
                error_message: result.error_message,
                results: result.results || {
                    failed_step_index: result.failed_step_index,
                    timestamp: new Date().toISOString()
                },
                user_id: user.id,
            };

            // Remove undefined/null test_id to avoid constraint issues
            if (!payload.test_id) delete payload.test_id;

            const { data, error } = await supabase
                .from("nocodemobile_test_executions")
                .insert(payload)
                .select()
                .single();

            if (error) {
                console.error("[ExecutionHistoryService] Supabase insertion error:", error);
                throw error;
            }

            return data;
        } catch (err) {
            console.error("[ExecutionHistoryService] Failed to save execution:", err);
            // We don't want to break the UI if logging fails
            return null;
        }
    },

    /**
     * Saves a suite execution result (for consistency with existing logic)
     */
    async saveSuiteExecution(result: ExecutionResult) {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return null;

            const payload: any = {
                suite_id: result.suite_id,
                status: result.status,
                started_at: new Date(Date.now() - (result.duration_ms || 0)).toISOString(),
                passed_tests: result.status === "SUCCESS" ? 1 : 0,
                failed_tests: result.status === "FAILED" ? 1 : 0,
                total_tests: 1,
                results: {
                    error_message: result.error_message,
                    failed_step_index: result.failed_step_index
                },
                user_id: user.id,
            };

            // Avoid inserting null suite_id if not present
            if (!payload.suite_id) delete payload.suite_id;

            const { data, error } = await supabase
                .from("nocodemobile_suite_executions")
                .insert(payload)
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (err) {
            console.error("[ExecutionHistoryService] Failed to save suite execution:", err);
            return null;
        }
    }
};
