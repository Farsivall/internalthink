export function BackgroundOverlay() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
      {/* Base gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-surface-900 via-surface-900 to-surface-800" />
      {/* Moving blobs */}
      <div
        className="absolute w-[120%] h-[120%] -top-[20%] -left-[20%] opacity-30 animate-blob-slow"
        style={{
          background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(59, 130, 246, 0.4) 0%, transparent 70%)',
        }}
      />
      <div
        className="absolute w-[100%] h-[100%] top-0 right-0 opacity-25 animate-blob-medium"
        style={{
          background: 'radial-gradient(ellipse 50% 60% at 80% 20%, rgba(217, 70, 239, 0.35) 0%, transparent 65%)',
        }}
      />
      <div
        className="absolute w-[110%] h-[110%] -bottom-[10%] left-1/2 -translate-x-1/2 opacity-20 animate-blob-slower"
        style={{
          background: 'radial-gradient(ellipse 55% 45% at 50% 90%, rgba(6, 182, 212, 0.4) 0%, transparent 60%)',
        }}
      />
      <div
        className="absolute w-[80%] h-[80%] top-1/2 left-0 -translate-y-1/2 opacity-20 animate-blob-slow"
        style={{
          background: 'radial-gradient(ellipse 40% 50% at 10% 50%, rgba(245, 158, 11, 0.3) 0%, transparent 60%)',
        }}
      />
      <div
        className="absolute w-[90%] h-[90%] top-1/4 right-1/4 opacity-15 animate-blob-medium"
        style={{
          background: 'radial-gradient(ellipse 45% 45% at 60% 40%, rgba(139, 92, 246, 0.35) 0%, transparent 65%)',
        }}
      />
      {/* Subtle grid */}
      <div
        className="absolute inset-0 opacity-[0.04] animate-grid-drift"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.12) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.12) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
        }}
        aria-hidden
      />
    </div>
  )
}
