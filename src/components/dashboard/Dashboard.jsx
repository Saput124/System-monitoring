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
  
  // 🔥 NEW: Vendor analytics
  const [vendorRankings, setVendorRankings] = useState([])
  const [selectedActivityForRanking, setSelectedActivityForRanking] = useState('')
  const [activities, setActivities] = useState([])
  
  // 🔥 NEW: Progress chart data
  const [weeklyProgress, setWeeklyProgress] = useState([])
  
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
    fetchActivities()
  }, [])
  
  useEffect(() => {
    if (selectedActivityForRanking) {
      fetchVendorRankings()
    }
  }, [selectedActivityForRanking])

  const fetchActivities = async () => {
    const { data } = await supabase
      .from('activities')
      .select('*')
      .eq('active', true)
      .eq('requires_vendor', true)
      .order('name')
    
    setActivities(data || [])
    if (data && data.length > 0) {
      setSelectedActivityForRanking(data[0].id)
    }
  }

  const fetchDashboardData = async () => {
    setLoading(true)

    try {
      // Fetch plans based on user role
      let plansQuery = supabase
        .from('activity_plans')
        .select(`
          *,
          sections(name),
          activities(name),
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

      // 🔥 NEW: Fetch weekly progress for chart
      await fetchWeeklyProgress()

      // Fetch recent transactions
      let txQuery = supabase
        .from('transactions')
        .select(`
          *,
          transaction_blocks(
            *,
            blocks(code, name)
          ),
          activity_plans!inner(
            *,
            activities(name),
            sections(name),
            vendors(name)
          ),
          users(full_name)
        `)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(20)

      if (user.role === 'section_head') {
        txQuery = txQuery.eq('activity_plans.section_id', user.section_id)
      } else if (user.role === 'vendor') {
        txQuery = txQuery.eq('activity_plans.vendor_id', user.vendor_id)
      }

      const { data: txData } = await txQuery
      setRecentTransactions((txData || []).slice(0, 10))

    } catch (error) {
      console.error('Error fetching dashboard:', error)
    }

    setLoading(false)
  }
  
  // 🔥 NEW: Fetch weekly progress data
  const fetchWeeklyProgress = async () => {
    const today = new Date()
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    
    let query = supabase
      .from('transactions')
      .select(`
        transaction_date,
        transaction_blocks(luas_dikerjakan)
      `)
      .gte('transaction_date', sevenDaysAgo.toISOString().split('T')[0])
      .order('transaction_date')
    
    if (user.role === 'section_head') {
      query = query.eq('activity_plans.section_id', user.section_id)
    } else if (user.role === 'vendor') {
      query = query.eq('activity_plans.vendor_id', user.vendor_id)
    }
    
    const { data } = await query
    
    if (data) {
      // Group by date
      const groupedByDate = {}
      data.forEach(tx => {
        const date = tx.transaction_date
        if (!groupedByDate[date]) {
          groupedByDate[date] = 0
        }
        const totalLuas = tx.transaction_blocks?.reduce((sum, tb) => sum + parseFloat(tb.luas_dikerjakan || 0), 0) || 0
        groupedByDate[date] += totalLuas
      })
      
      // Convert to array for chart
      const progressData = Object.keys(groupedByDate).map(date => ({
        date: new Date(date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
        luas: groupedByDate[date].toFixed(2)
      }))
      
      setWeeklyProgress(progressData)
    }
  }
  
  // 🔥 NEW: Fetch vendor rankings by activity
  const fetchVendorRankings = async () => {
    let query = supabase
      .from('activity_plans')
      .select(`
        *,
        vendors(id, name),
        block_activities(luas_total, luas_completed, status)
      `)
      .eq('activity_id', selectedActivityForRanking)
      .not('vendor_id', 'is', null)
    
    if (user.role === 'section_head') {
      query = query.eq('section_id', user.section_id)
    }
    
    const { data } = await query
    
    if (data) {
      // Group by vendor
      const vendorStats = {}
      
      data.forEach(plan => {
        const vendorId = plan.vendors?.id
        const vendorName = plan.vendors?.name
        
        if (!vendorId) return
        
        if (!vendorStats[vendorId]) {
          vendorStats[vendorId] = {
            vendor_id: vendorId,
            vendor_name: vendorName,
            total_plans: 0,
            total_blocks: 0,
            completed_blocks: 0,
            total_luas: 0,
            completed_luas: 0
          }
        }
        
        vendorStats[vendorId].total_plans += 1
        vendorStats[vendorId].total_blocks += plan.block_activities?.length || 0
        vendorStats[vendorId].completed_blocks += plan.block_activities?.filter(ba => ba.status === 'completed').length || 0
        
        const totalLuas = plan.block_activities?.reduce((sum, ba) => sum + parseFloat(ba.luas_total || 0), 0) || 0
        const completedLuas = plan.block_activities?.reduce((sum, ba) => sum + parseFloat(ba.luas_completed || 0), 0) || 0
        
        vendorStats[vendorId].total_luas += totalLuas
        vendorStats[vendorId].completed_luas += completedLuas
      })
      
      // Convert to array and calculate performance
      const rankings = Object.values(vendorStats).map(v => ({
        ...v,
        completion_rate: v.total_luas > 0 ? (v.completed_luas / v.total_luas) * 100 : 0
      }))
      
      // Sort by completion rate
      rankings.sort((a, b) => b.completion_rate - a.completion_rate)
      
      setVendorRankings(rankings)
    }
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
          <h1 className="text-2xl font-bold">📊 Dashboard</h1>
          <p className="text-gray-600">Welcome back, {user.full_name}!</p>
          {user.role === 'section_head' && (
            <p className="text-sm text-blue-600">Section Head View</p>
          )}
          {user.role === 'vendor' && (
            <p className="text-sm text-purple-600">Vendor View</p>
          )}
        </div>
        <div className="text-sm text-gray-600">
          {new Date().toLocaleDateString('id-ID', { dateStyle: 'full' })}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90">Total Rencana</p>
              <p className="text-3xl font-bold">{stats.total_plans}</p>
            </div>
            <div className="text-4xl opacity-80">📋</div>
          </div>
          <div className="mt-2 text-xs opacity-90">
            {stats.in_progress_plans} in progress · {stats.completed_plans} completed
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90">Blok Selesai</p>
              <p className="text-3xl font-bold">{stats.completed_blocks}</p>
            </div>
            <div className="text-4xl opacity-80">✅</div>
          </div>
          <div className="mt-2 text-xs opacity-90">
            dari {stats.total_blocks} blok ({stats.total_blocks > 0 ? Math.round((stats.completed_blocks / stats.total_blocks) * 100) : 0}%)
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90">Total Luas</p>
              <p className="text-3xl font-bold">{stats.total_luas.toFixed(1)}</p>
            </div>
            <div className="text-4xl opacity-80">🗺️</div>
          </div>
          <div className="mt-2 text-xs opacity-90">
            Ha total area
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90">Luas Selesai</p>
              <p className="text-3xl font-bold">{stats.completed_luas.toFixed(1)}</p>
            </div>
            <div className="text-4xl opacity-80">📊</div>
          </div>
          <div className="mt-2 text-xs opacity-90">
            Ha completed ({stats.total_luas > 0 ? Math.round((stats.completed_luas / stats.total_luas) * 100) : 0}%)
          </div>
        </div>
      </div>

      {/* 🔥 NEW: Weekly Progress Chart */}
      {weeklyProgress.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span>📈</span> Progress 7 Hari Terakhir
          </h2>
          <div className="h-64">
            <div className="flex items-end justify-between h-full gap-2">
              {weeklyProgress.map((data, idx) => {
                const maxLuas = Math.max(...weeklyProgress.map(d => parseFloat(d.luas)))
                const height = maxLuas > 0 ? (parseFloat(data.luas) / maxLuas) * 100 : 0
                
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-2">
                    <div className="text-xs font-medium text-blue-600">{data.luas} Ha</div>
                    <div 
                      className="w-full bg-gradient-to-t from-blue-500 to-blue-400 rounded-t transition-all hover:from-blue-600 hover:to-blue-500"
                      style={{ height: `${height}%`, minHeight: '20px' }}
                    />
                    <div className="text-xs text-gray-600 text-center">{data.date}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Recent Plans */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span>🎯</span> Recent Work Plans
            </h2>
          </div>
          <div className="p-6">
            {recentPlans.length === 0 ? (
              <div className="text-center py-8 text-gray-500">Belum ada rencana kerja</div>
            ) : (
              <div className="space-y-3">
                {recentPlans.map(plan => {
                  const progress = getProgressPercentage(plan)
                  return (
                    <div key={plan.id} className="border rounded p-3 hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <div className="font-medium text-sm">{plan.activities.name}</div>
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
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all" 
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* 🔥 NEW: Vendor Rankings */}
        {user.role !== 'vendor' && activities.length > 0 && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b">
              <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
                <span>🏆</span> Vendor Performance Ranking
              </h2>
              <select
                value={selectedActivityForRanking}
                onChange={(e) => setSelectedActivityForRanking(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500"
              >
                {activities.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div className="p-6">
              {vendorRankings.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  Belum ada data vendor untuk activity ini
                </div>
              ) : (
                <div className="space-y-3">
                  {vendorRankings.map((vendor, idx) => (
                    <div key={vendor.vendor_id} className="border rounded p-3">
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                          idx === 0 ? 'bg-yellow-400 text-yellow-900' :
                          idx === 1 ? 'bg-gray-300 text-gray-700' :
                          idx === 2 ? 'bg-orange-300 text-orange-900' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {idx + 1}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-sm">{vendor.vendor_name}</div>
                          <div className="text-xs text-gray-600">
                            {vendor.completed_blocks} / {vendor.total_blocks} blok · 
                            {vendor.completed_luas.toFixed(1)} / {vendor.total_luas.toFixed(1)} Ha
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-green-600">
                            {vendor.completion_rate.toFixed(0)}%
                          </div>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-green-500 h-2 rounded-full transition-all" 
                          style={{ width: `${vendor.completion_rate}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Material Usage - shown for non-vendor or when no activities */}
        {(user.role === 'vendor' || activities.length === 0) && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <span>🧪</span> Material Usage
              </h2>
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
                        <span className="text-xs font-medium text-gray-600">
                          {parseFloat(m.usage_percentage).toFixed(0)}%
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-purple-600 h-2 rounded-full" 
                            style={{ width: `${m.usage_percentage}%` }}
                          />
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
        )}
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <span>📝</span> Recent Transactions
          </h2>
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
                  {user.role === 'admin' && (
                    <>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Section</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {recentTransactions.map(tx => {
                  const totalLuas = tx.transaction_blocks?.reduce((sum, tb) => sum + parseFloat(tb.luas_dikerjakan || 0), 0) || 0
                  const blockCodes = tx.transaction_blocks?.map(tb => tb.blocks?.code).filter(Boolean).join(', ') || '-'
                  
                  return (
                    <tr key={tx.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm whitespace-nowrap">
                        {new Date(tx.transaction_date).toLocaleDateString('id-ID')}
                      </td>
                      <td className="px-6 py-4 text-sm">{tx.activity_plans?.activities?.name || '-'}</td>
                      <td className="px-6 py-4 text-sm font-medium">{blockCodes}</td>
                      <td className="px-6 py-4 text-sm text-right font-medium text-blue-600">
                        {totalLuas.toFixed(2)}
                      </td>
                      {user.role === 'admin' && (
                        <>
                          <td className="px-6 py-4 text-sm">{tx.activity_plans?.sections?.name || '-'}</td>
                          <td className="px-6 py-4 text-sm">{tx.activity_plans?.vendors?.name || '-'}</td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
