# Fix State Reset Issues in Mobile Automation Tabs

## Plan Overview
Lift all component state to index.tsx parent component and change from TabsContent to conditional rendering to prevent state loss when switching tabs.

## Steps
- [ ] Lift state from MobileSetupWizard to index.tsx
- [ ] Lift state from MobileRecorder to index.tsx
- [ ] Lift state from MobileInspector to index.tsx
- [ ] Update index.tsx to use conditional rendering instead of TabsContent
- [ ] Update MobileSetupWizard to accept props instead of local state
- [ ] Update MobileRecorder to accept props instead of local state
- [ ] Update MobileInspector to accept props instead of local state
- [ ] Test tab switching to ensure state persists
