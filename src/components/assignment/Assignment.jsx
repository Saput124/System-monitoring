import { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabase'

export default function Assignment({ user }) {
  const [pendingPlans, setPendingPlans] = useState([])
  const [approvedPlans, setApprovedPlans] = useState([])
  const [activeTab, setActiveTab] = useState('pending')
  const [loading, setLoading] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [plannedMaterials, setPlannedMaterials] = useState([])
  const [blockActivities, setBlockActivities] = useState([])

  useEffect(() => {
    fetchPlans()
  }, [activeTab])

  const fetchPlans = async () => {
    setLoading(true)
    
    const status = activeTab === 'pending' ? 'pending' : ['approved', 'in_progress', 'completed']
    
    const { data } = await supabase
      .from('activity_plans')
      .select(`
        *,
        sections(name),
        activity_types(name, uses_stages),
        activity_stages(name),
        created_by_user:users!activity_plans_created_by_fkey(username, email),
        block_activities(
          id,
          status,
          luas_total,
          luas_completed,
          blocks(kode_blok, tanaman_kategori)
        )
      `)
      .in('status', Array.isArray(status) ? status : [status])
      .order('created_at', { ascending: false })

    if (activeTab === 'pending') {
      setPendingPlans(data || [])
    } else {
      setApprovedPlans(data || [])
    }
    
    setLoading(false)
  }

  const fetchPlanDetails = async (planId) => {
    // Fetch planned materials
    const { data: materials } = await supabase
      .from('planned_materials')
      .select(`
        *,
        materials(code, name, unit)
      `)
      .eq('activity_plan_id', planId)

    setPlannedMaterials(materials || [])

    // Fetch block activities
    const { data: blocks } = await supabase
      .from('block_activities')
      .select(`
        *,
        blocks(kode_blok, nama_blok, luas_blok, tanaman_kategori, varietas, kawasan)
      `)
      .eq('activity_plan_id', planId)

    setBlockActivities(blocks || [])
  }

  const handleViewDetail = (plan) => {
    setSelectedPlan(plan)
    fetchPlanDetails(plan.id)
    setShowDetailModal(true)
  }

  const handleApprovePlan = async (planId) => {
    if (!confirm('Setujui rencana kerja ini?')) return

    const { error } = await supabase
      .from('activity_plans')
      .update({ 
        status: 'approved',
        approved_by: user.id,
        approved_at: new Date().toISOString()
      })
      .eq('id', planId)

    if (!error) {
      alert('✅ Rencana kerja disetujui')
      fetchPlans()
      setShowDetailModal(false)
    } else {
      alert('❌ Error: ' + error.message)
    }
  }

  const handleRejectPlan = async (planId) => {
    const notes = prompt('Alasan penolakan:')
    if (!notes) return

    const { error } = await supabase
      .from('activity_plans')
      .update({ 
        status: 'rejected',
        approval_notes: notes,
        approved_by: user.id,
        approved_at: new Date().toISOString()
      })
      .eq('id', planId)

    if (!error) {
      alert('✅ Rencana kerja ditolak')
      fetchPlans()
      setShowDetailModal(false)
    } else {
      alert('❌ Error: ' + error.message)
    }
  }

  const getTotalLuas = (plan) => {
    return plan.block_activities?.reduce((sum, ba) => sum + parseFloat(ba.luas_total || 0), 0) || 0
  }

  const getCompletedLuas = (plan) => {
    return plan.block_activities?.reduce((sum, ba) => sum + parseFloat(ba.luas_completed || 0), 0) || 0
  }

  const getProgressPercentage = (plan) => {
    const total = getTotalLuas(plan)
    const completed = getCompletedLuas(plan)
    return total > 0 ? Math.round((completed / total) * 100) : 0
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Plan Approval & Assignment</h1>

      <div className="bg-white rounded-lg shadow">
        <div className="border-b">
          <div className="flex space-x-4 px-6">
            <button
              onClick={() => setActiveTab('pending')}
              className={`py-4 px-2 border-b-2 font-medium ${
                activeTab === 'pending'
                  ? 'border-orange-600 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              ⏳ Pending Approval ({pendingPlans.length})
            </button>
            <button
              onClick={() => setActiveTab('approved')}
              className={`py-4 px-2 border-b-2 font-medium ${
                activeTab === 'approved'
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              ✓ Approved Plans ({approvedPlans.length})
            </button>
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-center py-8">Loading...</div>
          ) : (
            <div className="space-y-4">
              {activeTab === 'pending' ? (
                pendingPlans.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <div className="text-4xl mb-4">✅</div>
                    <div>Tidak ada rencana yang menunggu approval</div>
                  </div>
                ) : (
                  pendingPlans.map(plan => (
                    <div key={plan.id} className="border border-orange-200 rounded-lg p-4 hover:shadow-md transition bg-orange-50">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <h3 className="font-semibold text-lg">{plan.activity_types?.name}</h3>
                            {plan.activity_stages && (
                              <span className="text-sm bg-blue-100 text-blue-700 px-2 py-1 rounded">
                                {plan.activity_stages.name}
                              </span>
                            )}
                            <span className="text-sm bg-orange-100 text-orange-700 px-2 py-1 rounded">
                              Pending
                            </span>
                          </div>
                          <div className="text-sm text-gray-700 space-y-1">
                            <div>Section: <span className="font-medium">{plan.sections?.name}</span></div>
                            <div>Target: <span className="font-medium">{new Date(plan.target_bulan).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</span></div>
                            <div>Blok: <span className="font-medium">{plan.block_activities?.length || 0} blok ({getTotalLuas(plan).toFixed(2)} Ha)</span></div>
                            <div>Dibuat oleh: <span className="font-medium">{plan.created_by_user?.username || 'Unknown'}</span></div>
                            <div className="text-xs text-gray-500">
                              Dibuat: {new Date(plan.created_at).toLocaleString('id-ID')}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col space-y-2">
                          <button
                            onClick={() => handleViewDetail(plan)}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                          >
                            👁️ Detail
                          </button>
                          <button
                            onClick={() => handleApprovePlan(plan.id)}
                            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                          >
                            ✓ Approve
                          </button>
                          <button
                            onClick={() => handleRejectPlan(plan.id)}
                            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                          >
                            ✕ Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )
              ) : (
                approvedPlans.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <div className="text-4xl mb-4">📋</div>
                    <div>Belum ada rencana yang disetujui</div>
                  </div>
                ) : (
                  approvedPlans.map(plan => (
                    <div key={plan.id} className="border rounded-lg p-4 hover:shadow-md transition">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <h3 className="font-semibold text-lg">{plan.activity_types?.name}</h3>
                            {plan.activity_stages && (
                              <span className="text-sm bg-blue-100 text-blue-700 px-2 py-1 rounded">
                                {plan.activity_stages.name}
                              </span>
                            )}
                            <span className={`text-sm px-2 py-1 rounded ${
                              plan.status === 'approved' ? 'bg-green-100 text-green-700' :
                              plan.status === 'in_progress' ? 'bg-yellow-100 text-yellow-700' :
                              plan.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {plan.status}
                            </span>
                          </div>
                          <div className="text-sm text-gray-600 space-y-1">
                            <div>Section: {plan.sections?.name}</div>
                            <div>Target: {new Date(plan.target_bulan).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</div>
                            <div>Blok: {plan.block_activities?.length || 0} blok ({getTotalLuas(plan).toFixed(2)} Ha)</div>
                            <div>Progress: {getCompletedLuas(plan).toFixed(2)} / {getTotalLuas(plan).toFixed(2)} Ha ({getProgressPercentage(plan)}%)</div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleViewDetail(plan)}
                          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                        >
                          👁️ Detail
                        </button>
                      </div>
                    </div>
                  ))
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* DETAIL MODAL */}
      {showDetailModal && selectedPlan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <h2 className="text-2xl font-bold">Detail Rencana Kerja</h2>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>

              {/* Plan Info */}
              <div className="mb-6 bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold mb-3">Informasi Rencana</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Activity:</span>
                    <span className="ml-2 font-medium">{selectedPlan.activity_types?.name}</span>
                  </div>
                  {selectedPlan.activity_stages && (
                    <div>
                      <span className="text-gray-600">Stage:</span>
                      <span className="ml-2 font-medium">{selectedPlan.activity_stages.name}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-600">Section:</span>
                    <span className="ml-2 font-medium">{selectedPlan.sections?.name}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Target:</span>
                    <span className="ml-2 font-medium">
                      {new Date(selectedPlan.target_bulan).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Status:</span>
                    <span className={`ml-2 px-2 py-1 rounded text-xs ${
                      selectedPlan.status === 'pending' ? 'bg-orange-100 text-orange-700' :
                      selectedPlan.status === 'approved' ? 'bg-green-100 text-green-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {selectedPlan.status}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Dibuat:</span>
                    <span className="ml-2 font-medium">
                      {new Date(selectedPlan.created_at).toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Blocks */}
              <div className="mb-6">
                <h3 className="font-semibold mb-3">Blok yang Akan Dikerjakan ({blockActivities.length})</h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kode Blok</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nama</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kategori</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Luas (Ha)</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {blockActivities.map(ba => (
                        <tr key={ba.id}>
                          <td className="px-4 py-3 text-sm font-medium">{ba.blocks.kode_blok}</td>
                          <td className="px-4 py-3 text-sm">{ba.blocks.nama_blok}</td>
                          <td className="px-4 py-3 text-sm">
                            {ba.blocks.tanaman_kategori && (
                              <span className={`px-2 py-1 rounded text-xs ${
                                ba.blocks.tanaman_kategori === 'PC' 
                                  ? 'bg-green-100 text-green-700' 
                                  : 'bg-blue-100 text-blue-700'
                              }`}>
                                {ba.blocks.tanaman_kategori}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-right">{ba.luas_total}</td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`px-2 py-1 rounded text-xs ${
                              ba.status === 'planned' ? 'bg-gray-100 text-gray-700' :
                              ba.status === 'in_progress' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-green-100 text-green-700'
                            }`}>
                              {ba.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td colSpan="3" className="px-4 py-3 text-sm font-semibold text-right">Total:</td>
                        <td className="px-4 py-3 text-sm font-semibold text-right">
                          {getTotalLuas(selectedPlan).toFixed(2)} Ha
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Materials */}
              {plannedMaterials.length > 0 && (
                <div className="mb-6">
                  <h3 className="font-semibold mb-3">Material yang Dibutuhkan</h3>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Terpakai</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sisa</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {plannedMaterials.map(pm => (
                          <tr key={pm.id}>
                            <td className="px-4 py-3 text-sm">
                              <div className="font-medium">{pm.materials.name}</div>
                              <div className="text-xs text-gray-500">{pm.materials.code}</div>
                            </td>
                            <td className="px-4 py-3 text-sm text-right">
                              {pm.total_quantity.toFixed(2)} {pm.unit}
                            </td>
                            <td className="px-4 py-3 text-sm text-right">
                              {(pm.allocated_quantity || 0).toFixed(2)} {pm.unit}
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-medium">
                              {pm.remaining_quantity.toFixed(2)} {pm.unit}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Actions */}
              {selectedPlan.status === 'pending' && (
                <div className="flex justify-end space-x-3 pt-4 border-t">
                  <button
                    onClick={() => handleRejectPlan(selectedPlan.id)}
                    className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                  >
                    ✕ Reject
                  </button>
                  <button
                    onClick={() => handleApprovePlan(selectedPlan.id)}
                    className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                  >
                    ✓ Approve
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}