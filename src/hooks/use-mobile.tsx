/**
 * Purpose:
 * A custom hook to detect if the current viewport width is within
 * the mobile breakpoint range.
 */
import * as React from "react"

const MOBILE_BREAKPOINT = 768

/**
 * Purpose:
 * Returns a boolean indicating if the current screen size is "mobile".
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
