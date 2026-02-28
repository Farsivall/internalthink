import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { BackgroundOverlay } from './BackgroundOverlay'
import { Header } from './Header'
import { Sidebar } from './Sidebar'

export function Layout({ children }: { children?: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  return (
    <div className="min-h-screen flex flex-col relative">
      <BackgroundOverlay />
      <Header onMenuClick={() => setSidebarOpen((o) => !o)} />
      <div className="flex flex-1 relative z-10">
        <Sidebar open={sidebarOpen} />
        <main className="flex-1 overflow-auto p-6 lg:p-8">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  )
}
