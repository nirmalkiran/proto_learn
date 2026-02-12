import MobileRecorderContainer, { MobileRecorderProps } from "./recorder/MobileRecorderContainer";

/**
 * Component: MobileRecorder
 * Purpose: Compatibility facade that preserves the original public import path.
 * Important: Keep this wrapper stable while internals are extracted into container/hooks/services.
 */
export default function MobileRecorder(props: MobileRecorderProps) {
  return <MobileRecorderContainer {...props} />;
}

