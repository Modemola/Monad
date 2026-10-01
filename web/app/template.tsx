/// Every route arrives the same way: up out of a soft blur. A template, not a layout, so it
/// re-mounts — and re-plays — on each navigation. Plain CSS rather than a motion component, so the
/// page is visible from the first paint instead of waiting at opacity 0 for hydration.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="route-enter">{children}</div>;
}
