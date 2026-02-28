export function AttachmentsSection({ docCount, slideCount }: { docCount: number; slideCount: number }) {
  return (
    <div className="rounded-xl bg-surface-800/80 backdrop-blur border border-white/10 p-4 animate-fade-in hover:border-white/15 transition-colors duration-300">
      <h3 className="text-sm font-medium text-white/80 mb-3">Attachments</h3>
      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-2 text-sm text-white/70">
          <span>📄</span>
          <span>{docCount} documents</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-white/70">
          <span>📊</span>
          <span>{slideCount} slides</span>
        </div>
      </div>
      <button
        type="button"
        className="mt-4 px-3 py-2 rounded-lg border border-white/20 text-sm text-white/80 hover:bg-white/10 hover:border-white/30 transition-all duration-200"
      >
        Upload file
      </button>
    </div>
  )
}
