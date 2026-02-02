import { BrowserRouter, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Login from './components/auth/Login'
import Dashboard from './components/dashboard/Dashboard'
import MasterData from './components/master/MasterData'
import Assignment from './components/assignment/Assignment'
import WorkPlanRegistration from './components/planning/WorkPlanRegistration'
import Transaction from './components/transaction/Transaction'

function MainLayout({ user, onLogout }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const location = useLocation()

  const navigation = [
    { name: 'Dashboard', href: '/', icon: '📊', roles: ['admin', 'section_head', 'supervisor', 'vendor'] },
    { name: 'Master Data', href: '/master', icon: '📁', roles: ['admin'] },
    { name: 'Assignment', href: '/assignment', icon: '⚙️', roles: ['admin'] },
    { name: 'Planning', href: '/planning', icon: '📋', roles: ['admin', 'section_head'] },
    { name: 'Transaksi', href: '/transaction', icon: '💼', roles: ['admin', 'section_head', 'supervisor', 'vendor'] }
  ]

  const visibleNav = navigation.filter(item => item.roles.includes(user.role))

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <nav className="bg-gradient-to-r from-blue-600 to-blue-700 shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link to="/" className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
                  <span className="text-xl">🌱</span>
                </div>
                <span className="text-xl font-bold text-white hidden sm:block">VND Monitoring</span>
                <span className="text-xl font-bold text-white sm:hidden">VND</span>
              </Link>
            </div>

            <div className="hidden md:flex items-center space-x-1">
              {visibleNav.map((item) => (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive(item.href)
                      ? 'bg-white text-blue-600 shadow-md'
                      : 'text-white hover:bg-blue-500'
                  }`}
                >
                  <span className="mr-2">{item.icon}</span>
                  {item.name}
                </Link>
              ))}
            </div>

            <div className="flex items-center space-x-3">
              <div className="hidden sm:flex items-center space-x-2">
                <div className="text-right">
                  <div className="text-sm font-medium text-white">{user.full_name}</div>
                  <div className="text-xs text-blue-100">{user.role}</div>
                </div>
              </div>

              <button
                onClick={onLogout}
                className="hidden md:flex items-center px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
              >
                Logout
              </button>

              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-lg text-white hover:bg-blue-500 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {mobileMenuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden bg-blue-700 border-t border-blue-600">
            <div className="px-4 py-3 space-y-2">
              <div className="pb-3 border-b border-blue-600 mb-3">
                <div className="text-sm font-medium text-white">{user.full_name}</div>
                <div className="text-xs text-blue-200">{user.role}</div>
              </div>

              {visibleNav.map((item) => (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                    isActive(item.href)
                      ? 'bg-white text-blue-600 shadow-md'
                      : 'text-white hover:bg-blue-600'
                  }`}
                >
                  <span className="mr-3 text-xl">{item.icon}</span>
                  {item.name}
                </Link>
              ))}

              <button
                onClick={() => {
                  setMobileMenuOpen(false)
                  onLogout()
                }}
                className="w-full flex items-center px-4 py-3 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
              >
                <span className="mr-3">🚪</span>
                Logout
              </button>
            </div>
          </div>
        )}
      </nav>

      <main className="flex-1 w-full">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
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
