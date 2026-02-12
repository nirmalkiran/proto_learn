import MobileSetupWizardContainer, { MobileSetupWizardProps } from "./setup/MobileSetupWizardContainer";

/**
 * Component: MobileSetupWizard
 * Purpose: Compatibility facade that preserves the original public import path.
 * Important: Keep this wrapper stable while internals are extracted into container/hooks/services.
 */
export default function MobileSetupWizard(props: MobileSetupWizardProps) {
  return <MobileSetupWizardContainer {...props} />;
}

