import { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabase'

export default function WorkPlanRegistration({ user }) {
  const [activeTab, setActiveTab] = useState('plans')
  const [sections, setSections] = useState([])
  const [activities, setActivities] = useState([])
  const [vendors, setVendors] = useState([])
  const [blocks, setBlocks] = useState([])
  const [stages, setStages] = useState([])
  const [plans, setPlans] = useState([])
  const [materialSummary, setMaterialSummary] = useState([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    section_id: user.section_id || '',
    activity_type_id: '',
    vendor_id: '',
    target_bulan: new Date().toISOString().slice(0, 7) + '-01',
    stage_id: '',
    alternative_option: '',
    selectedBlocks: []
  })

  useEffect(() => {
    fetchMasterData()
    if (activeTab === 'plans') {
      fetchPlans()
    } else {
      fetchMaterialSummary()
    }
  }, [activeTab])

  const fetchMasterData = async () => {
    const [s, a, v, b, st] = await Promise.all([
      supabase.from('sections').select('*').eq('active', true),
      supabase.from('activity_types').select('*').eq('active', true),
      supabase.from('vendors').select('*').eq('active', true),
      supabase.from('blocks').select('*').eq('active', true).order('code'),
      supabase.from('activity_stages').select('*').eq('active', true).order('sequence_order')
    ])
    
    setSections(s.data || [])
    setActivities(a.data || [])
    setVendors(v.data || [])
    setBlocks(b.data || [])
    setStages(st.data || [])
  }

  const fetchPlans = async () => {
    setLoading(true)
    let query = supabase
      .from('activity_plans')
      .select(`
        *,
        sections(name),
        activity_types(name, requires_material, requires_vendor),
        vendors(name),
        activity_stages(name),
        block_activities(id, status, luas_total, luas_completed)
      `)
      .order('created_at', { ascending: false })

    if (user.role === 'section_head') {
      query = query.eq('section_id', user.section_id)
    }

    const { data } = await query
    setPlans(data || [])
    setLoading(false)
  }

  const fetchMaterialSummary = async () => {
    setLoading(true)
    let query = supabase.from('v_material_usage_summary').select('*')

    if (user.role === 'section_head') {
      query = query.eq('section_id', user.section_id)
    }

    const { data } = await query
    setMaterialSummary(data || [])
    setLoading(false)
  }

  const handleNewPlan = () => {
    setFormData({
      section_id: user.section_id || '',
      activity_type_id: '',
      vendor_id: '',
      target_bulan: new Date().toISOString().slice(0, 7) + '-01',
      stage_id: '',
      alternative_option: '',
      selectedBlocks: []
    })
    setShowModal(true)
  }

  const handleBlockToggle = (blockId) => {
    setFormData(prev => ({
      ...prev,
      selectedBlocks: prev.selectedBlocks.includes(blockId)
        ? prev.selectedBlocks.filter(id => id !== blockId)
        : [...prev.selectedBlocks, blockId]
    }))
  }

  const handleSavePlan = async () => {
    if (!formData.section_id || !formData.activity_type_id) {
      alert('❌ Section dan Activity harus diisi!')
      return
    }

    if (formData.selectedBlocks.length === 0) {
      alert('❌ Pilih minimal 1 blok!')
      return
    }

    const selectedActivity = activities.find(a => a.id === formData.activity_type_id)
    
    if (selectedActivity?.requires_vendor && !formData.vendor_id) {
      alert('❌ Activity ini membutuhkan vendor!')
      return
    }

    // Insert activity plan
    const { data: plan, error: planError } = await supabase
      .from('activity_plans')
      .insert({
        section_id: formData.section_id,
        activity_type_id: formData.activity_type_id,
        vendor_id: formData.vendor_id || null,
        target_bulan: formData.target_bulan,
        stage_id: formData.stage_id || null,
        alternative_option: formData.alternative_option || null,
        status: 'approved',
        created_by: user.id
      })
      .select()
      .single()

    if (planError) {
      alert('❌ Error: ' + planError.message)
      return
    }

    // Insert block activities
    const blockActivities = formData.selectedBlocks.map(blockId => {
      const block = blocks.find(b => b.id === blockId)
      return {
        activity_plan_id: plan.id,
        block_id: blockId,
        luas_total: block.luas_total,
        luas_remaining: block.luas_total,
        status: 'planned'
      }
    })

    const { error: blockError } = await supabase
      .from('block_activities')
      .insert(blockActivities)

    if (blockError) {
      alert('❌ Error: ' + blockError.message)
      return
    }

    // Calculate and insert planned materials
    if (selectedActivity?.requires_material) {
      const { data: activityMaterials } = await supabase
        .from('activity_materials')
        .select('*, materials(code, name, unit)')
        .eq('activity_type_id', formData.activity_type_id)
        .eq('stage_id', formData.stage_id || null)

      if (activityMaterials && activityMaterials.length > 0) {
        const materialGroups = {}
        
        formData.selectedBlocks.forEach(blockId => {
          const block = blocks.find(b => b.id === blockId)
          
          activityMaterials.forEach(am => {
            if (am.tanaman_kategori && am.tanaman_kategori !== block.kategori) return
            if (am.alternative_option && am.alternative_option !== formData.alternative_option) return

            const key = am.material_id
            if (!materialGroups[key]) {
              materialGroups[key] = {
                material_id: am.material_id,
                total_quantity: 0,
                unit: am.unit
              }
            }
            materialGroups[key].total_quantity += parseFloat(am.default_dosis) * parseFloat(block.luas_total)
          })
        })

        const plannedMaterials = Object.values(materialGroups).map(m => ({
          activity_plan_id: plan.id,
          material_id: m.material_id,
          total_quantity: m.total_quantity,
          remaining_quantity: m.total_quantity,
          unit: m.unit
        }))

        await supabase.from('planned_materials').insert(plannedMaterials)
      }
    }

    alert('✅ Rencana kerja berhasil dibuat!')
    setShowModal(false)
    fetchPlans()
  }

  const handleDeletePlan = async (id) => {
    if (!confirm('Yakin hapus rencana ini? Semua block activities juga akan terhapus.')) return

    const { error } = await supabase.from('activity_plans').delete().eq('id', id)
    
    if (!error) {
      alert('✅ Rencana berhasil dihapus')
      fetchPlans()
    } else {
      alert('❌ Error: ' + error.message)
    }
  }

  const getProgressPercentage = (plan) => {
    const total = plan.block_activities?.length || 0
    const completed = plan.block_activities?.filter(ba => ba.status === 'completed').length || 0
    return total > 0 ? Math.round((completed / total) * 100) : 0
  }

  const getTotalLuas = (plan) => {
    return plan.block_activities?.reduce((sum, ba) => sum + parseFloat(ba.luas_total || 0), 0) || 0
  }

  const getCompletedLuas = (plan) => {
    return plan.block_activities?.reduce((sum, ba) => sum + parseFloat(ba.luas_completed || 0), 0) || 0
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Work Plan Registration</h1>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="border-b">
          <div className="flex space-x-4">
            <button
              onClick={() => setActiveTab('plans')}
              className={`px-6 py-3 text-sm font-medium ${activeTab === 'plans' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}
            >
              📋 Rencana Kerja
            </button>
            <button
              onClick={() => setActiveTab('materials')}
              className={`px-6 py-3 text-sm font-medium ${activeTab === 'materials' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}
            >
              🧪 Rencana Material
            </button>
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'plans' ? (
            <>
              <div className="flex justify-between items-center mb-4">
                <button onClick={handleNewPlan} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">+ Buat Rencana</button>
                <div className="text-sm text-gray-600">Total: {plans.length} rencana</div>
              </div>

              {loading ? (
                <div className="text-center py-8">Loading...</div>
              ) : plans.length === 0 ? (
                <div className="text-center py-8 text-gray-500">Belum ada rencana kerja</div>
              ) : (
                <div className="space-y-4">
                  {plans.map(plan => {
                    const progress = getProgressPercentage(plan)
                    const totalLuas = getTotalLuas(plan)
                    const completedLuas = getCompletedLuas(plan)
                    
                    return (
                      <div key={plan.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <h3 className="font-semibold text-lg">{plan.activity_types?.name}</h3>
                            <div className="flex gap-4 mt-1 text-sm text-gray-600">
                              <span>📍 {plan.sections?.name}</span>
                              {plan.vendors && <span>🏢 {plan.vendors.name}</span>}
                              <span>📅 {new Date(plan.target_bulan).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</span>
                              {plan.activity_stages && <span>🎯 {plan.activity_stages.name}</span>}
                              {plan.alternative_option && <span>⚙️ {plan.alternative_option}</span>}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                              plan.status === 'completed' ? 'bg-green-100 text-green-800' :
                              plan.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                              plan.status === 'approved' ? 'bg-blue-100 text-blue-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {plan.status}
                            </span>
                            <button onClick={() => handleDeletePlan(plan.id)} className="text-red-600 hover:text-red-800 text-sm">🗑️</button>
                          </div>
                        </div>

                        <div className="grid grid-cols-4 gap-4 mb-3">
                          <div className="bg-blue-50 p-3 rounded">
                            <div className="text-xs text-gray-600">Total Blok</div>
                            <div className="text-xl font-bold">{plan.block_activities?.length || 0}</div>
                          </div>
                          <div className="bg-green-50 p-3 rounded">
                            <div className="text-xs text-gray-600">Selesai</div>
                            <div className="text-xl font-bold text-green-600">{plan.block_activities?.filter(ba => ba.status === 'completed').length || 0}</div>
                          </div>
                          <div className="bg-purple-50 p-3 rounded">
                            <div className="text-xs text-gray-600">Total Luas</div>
                            <div className="text-xl font-bold">{totalLuas.toFixed(2)} Ha</div>
                          </div>
                          <div className="bg-orange-50 p-3 rounded">
                            <div className="text-xs text-gray-600">Luas Selesai</div>
                            <div className="text-xl font-bold text-orange-600">{completedLuas.toFixed(2)} Ha</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="flex-1 bg-gray-200 rounded-full h-3">
                            <div className="bg-blue-600 h-3 rounded-full transition-all" style={{ width: `${progress}%` }}></div>
                          </div>
                          <span className="text-sm font-semibold text-gray-700">{progress}%</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="mb-4 text-sm text-gray-600">Summary material yang direncanakan vs yang sudah dialokasikan</div>

              {loading ? (
                <div className="text-center py-8">Loading...</div>
              ) : materialSummary.length === 0 ? (
                <div className="text-center py-8 text-gray-500">Belum ada data material</div>
              ) : (
                <div className="space-y-6">
                  {Object.entries(
                    materialSummary.reduce((acc, item) => {
                      const key = `${item.activity_name}-${item.target_bulan}`
                      if (!acc[key]) acc[key] = { activity: item.activity_name, bulan: item.target_bulan, materials: [] }
                      acc[key].materials.push(item)
                      return acc
                    }, {})
                  ).map(([key, group]) => (
                    <div key={key} className="border rounded-lg p-4">
                      <div className="flex justify-between items-center mb-4">
                        <div>
                          <h3 className="font-semibold text-lg">{group.activity}</h3>
                          <p className="text-sm text-gray-600">{new Date(group.bulan).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</p>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total Rencana</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Dialokasi</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Sisa</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Progress</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {group.materials.map(m => (
                              <tr key={m.id}>
                                <td className="px-4 py-3 text-sm font-medium">{m.material_code} - {m.material_name}</td>
                                <td className="px-4 py-3 text-sm text-right">{parseFloat(m.total_quantity).toFixed(2)} {m.unit}</td>
                                <td className="px-4 py-3 text-sm text-right text-green-600">{parseFloat(m.allocated_quantity).toFixed(2)} {m.unit}</td>
                                <td className="px-4 py-3 text-sm text-right text-orange-600">{parseFloat(m.remaining_quantity).toFixed(2)} {m.unit}</td>
                                <td className="px-4 py-3 text-sm text-right">
                                  <div className="flex items-center gap-2 justify-end">
                                    <div className="w-20 bg-gray-200 rounded-full h-2">
                                      <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${m.usage_percentage}%` }}></div>
                                    </div>
                                    <span className="font-medium">{parseFloat(m.usage_percentage).toFixed(0)}%</span>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl my-8 mx-4">
            <h2 className="text-xl font-bold mb-4">Buat Rencana Kerja</h2>
            
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Section *</label>
                  <select 
                    value={formData.section_id} 
                    onChange={(e) => setFormData({...formData, section_id: e.target.value})} 
                    className="w-full px-3 py-2 border rounded"
                    disabled={user.role === 'section_head'}
                  >
                    <option value="">Pilih Section</option>
                    {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Target Bulan *</label>
                  <input 
                    type="month" 
                    value={formData.target_bulan.slice(0, 7)} 
                    onChange={(e) => setFormData({...formData, target_bulan: e.target.value + '-01'})} 
                    className="w-full px-3 py-2 border rounded" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Activity *</label>
                <select 
                  value={formData.activity_type_id} 
                  onChange={(e) => setFormData({...formData, activity_type_id: e.target.value})} 
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="">Pilih Activity</option>
                  {activities.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} {!a.requires_vendor && '(Material Only)'} {!a.requires_material && '(Vendor Only)'}
                    </option>
                  ))}
                </select>
              </div>

              {formData.activity_type_id && activities.find(a => a.id === formData.activity_type_id)?.requires_vendor && (
                <div>
                  <label className="block text-sm font-medium mb-1">Vendor *</label>
                  <select 
                    value={formData.vendor_id} 
                    onChange={(e) => setFormData({...formData, vendor_id: e.target.value})} 
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value="">Pilih Vendor</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              )}

              {formData.activity_type_id && activities.find(a => a.id === formData.activity_type_id)?.requires_material && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Stage</label>
                    <select 
                      value={formData.stage_id} 
                      onChange={(e) => setFormData({...formData, stage_id: e.target.value})} 
                      className="w-full px-3 py-2 border rounded"
                    >
                      <option value="">Pilih Stage</option>
                      {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Alternative</label>
                    <input 
                      type="text" 
                      value={formData.alternative_option} 
                      onChange={(e) => setFormData({...formData, alternative_option: e.target.value})} 
                      placeholder="Normal A, Alt 1, dst" 
                      className="w-full px-3 py-2 border rounded" 
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">Pilih Blok * ({formData.selectedBlocks.length} dipilih)</label>
                <div className="border rounded p-3 max-h-60 overflow-y-auto">
                  <div className="grid grid-cols-2 gap-2">
                    {blocks.map(block => (
                      <label key={block.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.selectedBlocks.includes(block.id)}
                          onChange={() => handleBlockToggle(block.id)}
                          className="w-4 h-4"
                        />
                        <div className="flex-1 text-sm">
                          <div className="font-medium">{block.code} - {block.name}</div>
                          <div className="text-xs text-gray-600">
                            {block.kawasan} | {block.luas_total} Ha | {block.kategori} | {block.varietas}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border rounded hover:bg-gray-50">Batal</button>
              <button onClick={handleSavePlan} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Simpan Rencana</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
