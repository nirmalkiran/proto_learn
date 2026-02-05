/**
 * Purpose:
 * Manages the persistence of test execution results to Supabase.
 * Tracks both individual test runs and suite-level results.
 */
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);

/**
 * Purpose: Data structure for test and suite execution results.
 */
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
    async insertWithFallback<T extends Record<string, any>>(
        primaryTable: string,
        fallbackTable: string,
        payload: T
    ) {
        const attempt = async (table: string) => {
            const { data, error } = await supabase
                .from(table)
                .insert(payload)
                .select()
                .single();

            return { data, error };
        };

        const primary = await attempt(primaryTable);
        if (!primary.error) return primary.data;

        // If the table doesn't exist in this Supabase project, try the fallback name.
        const msg = (primary.error as any)?.message || "";
        const code = (primary.error as any)?.code || "";
        const isMissingTable = code === "PGRST205" || msg.includes("Could not find the table");
        if (!isMissingTable) throw primary.error;

        const fallback = await attempt(fallbackTable);
        if (fallback.error) throw fallback.error;
        return fallback.data;
    },

    /**
     * Purpose:
     * Saves a single test execution record to the 'nocodemobile_test_executions' table.
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

            return await ExecutionHistoryService.insertWithFallback(
                "nocodemobile_test_executions",
                "nocode_test_executions",
                payload
            );
        } catch (err) {
            console.error("[ExecutionHistoryService] Failed to save execution:", err);
            // We don't want to break the UI if logging fails
            return null;
        }
    },

    /**
     * Purpose:
     * Saves a suite-level execution record to the 'nocodemobile_suite_executions' table.
     * Groups multiple tests together for reporting.
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

            return await ExecutionHistoryService.insertWithFallback(
                "nocodemobile_suite_executions",
                "nocode_suite_executions",
                payload
            );
        } catch (err) {
            console.error("[ExecutionHistoryService] Failed to save suite execution:", err);
            return null;
        }
    }
};
