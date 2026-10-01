/// The ground everything stands on: warm black, a faint ember glow from above like light off a
/// furnace mouth, and assay-paper dots that fade toward the edges. Static and almost free — the
/// set pieces on the landing page do the moving.
export function Atmosphere() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-void">
      <div className="absolute left-1/2 top-[-30vh] h-[80vh] w-[120vw] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,rgba(232,182,97,0.10),rgba(185,133,53,0.04)_40%,transparent_70%)]" />
      <div className="assay absolute inset-0 opacity-60" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(5,4,3,0.7))]" />
    </div>
  );
}
