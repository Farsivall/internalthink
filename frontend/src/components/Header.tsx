import { Link } from 'react-router-dom'
import { useState } from 'react'

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const [search, setSearch] = useState('')
  const [profileOpen, setProfileOpen] = useState(false)
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-surface-900/90 backdrop-blur-md">
      <div className="flex items-center justify-between gap-4 h-14 px-4 lg:px-6">
        <div className="flex items-center gap-4">
          <button type="button" onClick={onMenuClick} className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-white/10" aria-label="Menu">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <Link to="/" className="font-semibold text-lg tracking-tight text-white">Aql</Link>
          <div className="hidden md:flex flex-1 max-w-md">
            <input
              type="search"
              placeholder="Search projects, decisions, documents…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 px-3 rounded-lg bg-surface-800 border border-white/10 text-sm placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-accent-blue/50"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className="px-4 py-2 rounded-lg bg-accent-blue text-white text-sm font-medium hover:bg-accent-blue/90 hover:scale-105 active:scale-100 transition-all duration-200"
          >
            New Project
          </Link>
          <div className="relative">
            <button
              type="button"
              onClick={() => setProfileOpen((o) => !o)}
              className="w-9 h-9 rounded-full bg-surface-700 border border-white/10 flex items-center justify-center text-sm font-medium hover:bg-surface-600"
              aria-label="Profile"
            >
              U
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 py-2 rounded-lg bg-surface-800 border border-white/10 shadow-xl">
                <div className="px-4 py-2 text-sm text-white/70 border-b border-white/10">Signed in</div>
                <button type="button" className="w-full px-4 py-2 text-left text-sm hover:bg-white/10">Settings</button>
                <button type="button" className="w-full px-4 py-2 text-left text-sm hover:bg-white/10">Sign out</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
