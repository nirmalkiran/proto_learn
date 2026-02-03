/**
 * Purpose:
 * Page-level wrapper for the Mobile Automation feature.
 * Integrates the automation module into the application layout.
 */
import { Layout } from "@/components/Layout";
import MobileAutomation from "@/components/mobileAutomation";

export default function MobileAutomationPage() {
  return (
    <Layout currentView="mobile-automation" onViewChange={() => { }}>
      <MobileAutomation />
    </Layout>
  );
}
