import { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabase'

export default function Dashboard({ user }) {
  const [stats, setStats] = useState({
    total_plans: 0,
    completed_plans: 0,
    in_progress_plans: 0,
    total_blocks: 0,
    completed_blocks: 0,
    total_luas: 0,
    completed_luas: 0
  })
  const [recentPlans, setRecentPlans] = useState([])
  const [materialSummary, setMaterialSummary] = useState([])
  const [recentTransactions, setRecentTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    setLoading(true)

    try {
      // Fetch plans based on user role
      let plansQuery = supabase
        .from('activity_plans')
        .select(`
          *,
          sections(name),
          activity_types(name),
          vendors(name),
          block_activities(id, status, luas_total, luas_completed)
        `)

      if (user.role === 'section_head') {
        plansQuery = plansQuery.eq('section_id', user.section_id)
      } else if (user.role === 'vendor') {
        plansQuery = plansQuery.eq('vendor_id', user.vendor_id)
      }

      const { data: plans } = await plansQuery

      if (plans) {
        const totalBlocks = plans.reduce((sum, p) => sum + (p.block_activities?.length || 0), 0)
        const completedBlocks = plans.reduce((sum, p) => sum + (p.block_activities?.filter(ba => ba.status === 'completed').length || 0), 0)
        const totalLuas = plans.reduce((sum, p) => sum + p.block_activities?.reduce((s, ba) => s + parseFloat(ba.luas_total || 0), 0), 0)
        const completedLuas = plans.reduce((sum, p) => sum + p.block_activities?.reduce((s, ba) => s + parseFloat(ba.luas_completed || 0), 0), 0)

        setStats({
          total_plans: plans.length,
          completed_plans: plans.filter(p => p.status === 'completed').length,
          in_progress_plans: plans.filter(p => p.status === 'in_progress').length,
          total_blocks: totalBlocks,
          completed_blocks: completedBlocks,
          total_luas: totalLuas,
          completed_luas: completedLuas
        })

        setRecentPlans(plans.slice(0, 5))
      }

      // Fetch material summary
      let materialQuery = supabase.from('v_material_usage_summary').select('*').limit(10)

      if (user.role === 'section_head') {
        materialQuery = materialQuery.eq('section_id', user.section_id)
      }

      const { data: materials } = await materialQuery
      setMaterialSummary(materials || [])

      // Fetch recent transactions
      let txQuery = supabase
        .from('transactions')
        .select(`
          *,
          block_activities(
            blocks(code, name),
            activity_plans(
              activity_types(name),
              sections(name)
            )
          )
        `)
        .order('created_at', { ascending: false })
        .limit(10)

      const { data: txData } = await txQuery
      
      let filteredTx = txData || []
      if (user.role === 'section_head') {
        filteredTx = filteredTx.filter(t => t.block_activities.activity_plans.section_id === user.section_id)
      } else if (user.role === 'vendor') {
        filteredTx = filteredTx.filter(t => t.block_activities.activity_plans.vendor_id === user.vendor_id)
      }
      
      setRecentTransactions(filteredTx.slice(0, 5))

    } catch (error) {
      console.error('Error fetching dashboard:', error)
    }

    setLoading(false)
  }

  const getProgressPercentage = (plan) => {
    const total = plan.block_activities?.length || 0
    const completed = plan.block_activities?.filter(ba => ba.status === 'completed').length || 0
    return total > 0 ? Math.round((completed / total) * 100) : 0
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-gray-600">Welcome back, {user.full_name}!</p>
        </div>
        <div className="text-sm text-gray-600">
          {new Date().toLocaleDateString('id-ID', { dateStyle: 'full' })}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Rencana</p>
              <p className="text-3xl font-bold text-blue-600">{stats.total_plans}</p>
            </div>
            <div className="text-4xl">📋</div>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            {stats.in_progress_plans} in progress, {stats.completed_plans} completed
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Blok Selesai</p>
              <p className="text-3xl font-bold text-green-600">{stats.completed_blocks}</p>
            </div>
            <div className="text-4xl">✅</div>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            dari {stats.total_blocks} blok ({stats.total_blocks > 0 ? Math.round((stats.completed_blocks / stats.total_blocks) * 100) : 0}%)
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Luas</p>
              <p className="text-3xl font-bold text-purple-600">{stats.total_luas.toFixed(1)}</p>
            </div>
            <div className="text-4xl">🗺️</div>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            Ha total area
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Luas Selesai</p>
              <p className="text-3xl font-bold text-orange-600">{stats.completed_luas.toFixed(1)}</p>
            </div>
            <div className="text-4xl">📊</div>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            Ha completed ({stats.total_luas > 0 ? Math.round((stats.completed_luas / stats.total_luas) * 100) : 0}%)
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Recent Plans */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <h2 className="text-lg font-semibold">Recent Work Plans</h2>
          </div>
          <div className="p-6">
            {recentPlans.length === 0 ? (
              <div className="text-center py-8 text-gray-500">Belum ada rencana kerja</div>
            ) : (
              <div className="space-y-3">
                {recentPlans.map(plan => {
                  const progress = getProgressPercentage(plan)
                  return (
                    <div key={plan.id} className="border rounded p-3">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <div className="font-medium text-sm">{plan.activity_types.name}</div>
                          <div className="text-xs text-gray-600">{plan.sections.name}</div>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          plan.status === 'completed' ? 'bg-green-100 text-green-800' :
                          plan.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {progress}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${progress}%` }}></div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Material Usage */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <h2 className="text-lg font-semibold">Material Usage</h2>
          </div>
          <div className="p-6">
            {materialSummary.length === 0 ? (
              <div className="text-center py-8 text-gray-500">Belum ada data material</div>
            ) : (
              <div className="space-y-3">
                {materialSummary.map(m => (
                  <div key={m.id} className="border rounded p-3">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="font-medium text-sm">{m.material_name}</div>
                        <div className="text-xs text-gray-600">{m.activity_name}</div>
                      </div>
                      <span className="text-xs font-medium text-gray-600">{parseFloat(m.usage_percentage).toFixed(0)}%</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div className="bg-purple-600 h-2 rounded-full" style={{ width: `${m.usage_percentage}%` }}></div>
                      </div>
                      <div className="text-gray-600 whitespace-nowrap">
                        {parseFloat(m.allocated_quantity).toFixed(1)} / {parseFloat(m.total_quantity).toFixed(1)} {m.unit}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold">Recent Transactions</h2>
        </div>
        <div className="overflow-x-auto">
          {recentTransactions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">Belum ada transaksi</div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tanggal</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Activity</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Blok</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Luas (Ha)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {recentTransactions.map(tx => (
                  <tr key={tx.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm">{new Date(tx.tanggal).toLocaleDateString('id-ID')}</td>
                    <td className="px-6 py-4 text-sm">{tx.block_activities.activity_plans.activity_types.name}</td>
                    <td className="px-6 py-4 text-sm font-medium">{tx.block_activities.blocks.code}</td>
                    <td className="px-6 py-4 text-sm text-right">{parseFloat(tx.luas_dikerjakan).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
