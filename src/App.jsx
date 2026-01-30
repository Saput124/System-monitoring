import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Login from './components/auth/Login'
import Dashboard from './components/dashboard/Dashboard'
import MasterData from './components/master/MasterData'
import Assignment from './components/assignment/Assignment'
import WorkPlanRegistration from './components/planning/WorkPlanRegistration'
import Transaction from './components/transaction/Transaction'

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
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!user) {
    return <Login onLogin={setUser} />
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex justify-between h-16">
              <div className="flex items-center space-x-8">
                <h1 className="text-xl font-bold text-blue-600">VND Monitoring</h1>
                <div className="flex space-x-4">
                  <a href="/" className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-blue-600">Dashboard</a>
                  {user.role === 'admin' && (
                    <>
                      <a href="/master" className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-blue-600">Master Data</a>
                      <a href="/assignment" className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-blue-600">Assignment</a>
                    </>
                  )}
                  {['admin', 'section_head'].includes(user.role) && (
                    <a href="/planning" className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-blue-600">Planning</a>
                  )}
                  <a href="/transaction" className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-blue-600">Transaksi</a>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-600">{user.full_name}</span>
                <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">{user.role}</span>
                <button onClick={handleLogout} className="text-sm text-red-600 hover:text-red-800">Logout</button>
              </div>
            </div>
          </div>
        </nav>

        <div className="max-w-7xl mx-auto px-4 py-8">
          <Routes>
            <Route path="/" element={<Dashboard user={user} />} />
            <Route path="/master" element={user.role === 'admin' ? <MasterData user={user} /> : <Navigate to="/" />} />
            <Route path="/assignment" element={user.role === 'admin' ? <Assignment user={user} /> : <Navigate to="/" />} />
            <Route path="/planning" element={['admin', 'section_head'].includes(user.role) ? <WorkPlanRegistration user={user} /> : <Navigate to="/" />} />
            <Route path="/transaction" element={<Transaction user={user} />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  )
}

export default App
