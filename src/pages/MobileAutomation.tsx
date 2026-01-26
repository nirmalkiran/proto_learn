import { Layout } from "@/components/Layout";
import MobileAutomation from "@/components/mobileAutomation";

export default function MobileAutomationPage() {
  return (
    <Layout currentView="mobile-automation" onViewChange={() => { }}>
      <MobileAutomation />
    </Layout>
  );
}
