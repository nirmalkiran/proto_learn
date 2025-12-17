import { Layout } from "@/components/Layout";
import MobileAutomation from "@/modules/mobileAutomation";

export default function MobileAutomationPage() {
  return (
    <Layout currentView="mobile-automation" onViewChange={() => {}}>
      <MobileAutomation />
    </Layout>
  );
}
