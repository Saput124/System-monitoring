import { BrowserRouter, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Login from './components/auth/Login'
import Dashboard from './components/dashboard/Dashboard'
import MasterData from './components/master/MasterData'
import Assignment from './components/assignment/Assignment'
import WorkPlanRegistration from './components/planning/WorkPlanRegistration'
import Transaction from './components/transaction/Transaction'

function MainLayout({ user, onLogout }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  const navigation = [
    { name: 'Dashboard', href: '/', icon: '📊', roles: ['admin', 'section_head', 'supervisor', 'vendor'] },
    { name: 'Master', href: '/master', icon: '📁', roles: ['admin'] },
    { name: 'Assignment', href: '/assignment', icon: '⚙️', roles: ['admin'] },
    { name: 'Planning', href: '/planning', icon: '📋', roles: ['admin', 'section_head'] },
    { name: 'Transaksi', href: '/transaction', icon: '💼', roles: ['admin', 'section_head', 'supervisor', 'vendor'] }
  ]

  const visibleNav = navigation.filter(item => item.roles.includes(user.role))

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 🖥️ DESKTOP: Top Bar with Sidebar Toggle */}
      <div className="lg:hidden bg-gradient-to-r from-blue-600 to-blue-700 text-white sticky top-0 z-30">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <span className="text-xl">🌱</span>
            </div>
            <span className="font-bold text-lg">VND</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-right">
              <div className="font-medium">{user.full_name}</div>
              <div className="text-blue-200 text-[10px]">{user.role}</div>
            </div>
            <button
              onClick={onLogout}
              className="p-2 bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="lg:flex lg:min-h-screen">
        {/* 🖥️ DESKTOP: Sidebar */}
        <aside className="hidden lg:flex lg:flex-col lg:w-64 bg-gradient-to-b from-blue-600 to-blue-700 text-white">
          <div className="p-6 border-b border-blue-500">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                <span className="text-2xl">🌱</span>
              </div>
              <div>
                <div className="font-bold text-xl">VND Monitoring</div>
                <div className="text-xs text-blue-200">Vendor Management</div>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-2">
            {visibleNav.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                  isActive(item.href)
                    ? 'bg-white text-blue-600 shadow-lg'
                    : 'text-white hover:bg-blue-500'
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                <span>{item.name}</span>
              </Link>
            ))}
          </nav>

          <div className="p-4 border-t border-blue-500">
            <div className="bg-blue-500 rounded-lg p-4">
              <div className="text-sm font-medium">{user.full_name}</div>
              <div className="text-xs text-blue-200 mt-1">{user.role}</div>
              <button
                onClick={onLogout}
                className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
              </button>
            </div>
          </div>
        </aside>

        {/* 📄 MAIN CONTENT */}
        <main className="flex-1 pb-16 lg:pb-0">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <Routes>
              <Route path="/" element={<Dashboard user={user} />} />
              <Route path="/master" element={user.role === 'admin' ? <MasterData user={user} /> : <Navigate to="/" />} />
              <Route path="/assignment" element={user.role === 'admin' ? <Assignment user={user} /> : <Navigate to="/" />} />
              <Route path="/planning" element={['admin', 'section_head'].includes(user.role) ? <WorkPlanRegistration user={user} /> : <Navigate to="/" />} />
              <Route path="/transaction" element={<Transaction user={user} />} />
            </Routes>
          </div>
        </main>
      </div>

      {/* 📱 MOBILE: Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
        <div className="grid grid-cols-5 gap-1 px-2 py-2">
          {visibleNav.map((item) => (
            <Link
              key={item.name}
              to={item.href}
              className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg transition-all ${
                isActive(item.href)
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-600'
              }`}
            >
              <span className="text-2xl mb-1">{item.icon}</span>
              <span className="text-[10px] font-medium leading-tight text-center">
                {item.name}
              </span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  )
}

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const storedUser = localStorage.getItem('vnd_user')
    if (storedUser) {
      setUser(JSON.parse(storedUser))
    }
    setLoading(false)
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('vnd_user')
    setUser(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 font-medium">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Login onLogin={setUser} />
  }

  return (
    <BrowserRouter>
      <MainLayout user={user} onLogout={handleLogout} />
    </BrowserRouter>
  )
}

export default App
