import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../utils/supabase'
import MaterialPreview from './MaterialPreview'

export default function WorkPlanRegistration({ user }) {
  const [activeTab, setActiveTab] = useState('plans')
  const [sections, setSections] = useState([])
  const [activities, setActivities] = useState([])
  const [vendors, setVendors] = useState([])
  const [blocks, setBlocks] = useState([])
  const [plans, setPlans] = useState([])
  const [materialSummary, setMaterialSummary] = useState([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  
  // NEW: State untuk smart form
  const [selectedActivity, setSelectedActivity] = useState(null)
  const [availableStages, setAvailableStages] = useState([])
  const [selectedStage, setSelectedStage] = useState(null)
  const [selectedBlocks, setSelectedBlocks] = useState([])
  
  const [formData, setFormData] = useState({
    section_id: user.section_id || '',
    activity_type_id: '',
    vendor_id: '',
    target_bulan: new Date().toISOString().slice(0, 7) + '-01',
    stage_id: '',
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

  // NEW: Fetch stages when activity changes
  useEffect(() => {
    if (selectedActivity) {
      fetchStagesForActivity(selectedActivity)
    } else {
      setAvailableStages([])
      setSelectedStage(null)
    }
  }, [selectedActivity])

  const fetchMasterData = async () => {
    const [s, a, v, b] = await Promise.all([
      supabase.from('sections').select('*').eq('active', true),
      supabase.from('activity_types').select('*').eq('active', true).order('name'),
      supabase.from('vendors').select('*').eq('active', true),
      supabase.from('blocks').select('*').eq('active', true).order('kode_blok')
    ])
    
    setSections(s.data || [])
    setActivities(a.data || [])
    setVendors(v.data || [])
    setBlocks(b.data || [])
  }

  // NEW: Fetch stages for selected activity
  const fetchStagesForActivity = async (activityId) => {
    try {
      const { data: activity } = await supabase
        .from('activity_types')
        .select('uses_stages')
        .eq('id', activityId)
        .single()
      
      if (!activity?.uses_stages) {
        setAvailableStages([])
        return
      }
      
      const { data: stages, error } = await supabase
        .from('activity_stages')
        .select('*')
        .eq('activity_type_id', activityId)
        .order('sequence_order')
      
      if (error) throw error
      
      setAvailableStages(stages || [])
    } catch (err) {
      console.error('Error fetching stages:', err)
      setAvailableStages([])
    }
  }

  // NEW: Calculate block summary (PC/RC)
  const blockSummary = useMemo(() => {
    const summary = { 
      PC: { count: 0, luas: 0, blocks: [] }, 
      RC: { count: 0, luas: 0, blocks: [] } 
    }
    
    selectedBlocks.forEach(block => {
      const kategori = block.tanaman_kategori || 'PC'
      summary[kategori].count++
      summary[kategori].luas += parseFloat(block.luas_blok || 0)
      summary[kategori].blocks.push(block.kode_blok)
    })
    
    return summary
  }, [selectedBlocks])

  // NEW: Check for mixed kategori
  const hasMixedKategori = blockSummary.PC.count > 0 && blockSummary.RC.count > 0

  // NEW: Filter stages based on selected blocks kategori
  const filteredStages = useMemo(() => {
    if (!availableStages.length) return []
    
    // If mixed kategori, only show stages without kategori restriction
    if (hasMixedKategori) {
      return availableStages.filter(s => !s.for_kategori)
    }
    
    // Determine main kategori from selected blocks
    const mainKategori = blockSummary.PC.count > 0 ? 'PC' : 'RC'
    
    // Filter stages: show those without kategori OR matching main kategori
    return availableStages.filter(s => 
      !s.for_kategori || s.for_kategori === mainKategori
    )
  }, [availableStages, blockSummary, hasMixedKategori])

  const fetchPlans = async () => {
    setLoading(true)
    let query = supabase
      .from('activity_plans')
      .select(`
        *,
        sections(name),
        activity_types(name),
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
      selectedBlocks: []
    })
    setSelectedActivity(null)
    setSelectedStage(null)
    setSelectedBlocks([])
    setShowModal(true)
  }

  // NEW: Handle activity change
  const handleActivityChange = (e) => {
    const activityId = e.target.value
    setSelectedActivity(activityId)
    setSelectedStage(null)
    setFormData({ ...formData, activity_type_id: activityId, stage_id: '' })
  }

  // NEW: Handle stage change
  const handleStageChange = (e) => {
    const stageId = e.target.value
    setSelectedStage(stageId)
    setFormData({ ...formData, stage_id: stageId })
  }

  // NEW: Handle block toggle
  const handleBlockToggle = (block) => {
    const isSelected = selectedBlocks.some(b => b.id === block.id)
    
    if (isSelected) {
      setSelectedBlocks(selectedBlocks.filter(b => b.id !== block.id))
    } else {
      setSelectedBlocks([...selectedBlocks, block])
    }
  }

  // NEW: Fetch SOP materials and calculate quantities
  const fetchSOPMaterials = async (activityTypeId, stageId, blocks) => {
    try {
      let query = supabase
        .from('activity_materials')
        .select(`
          id,
          material_id,
          default_dosis,
          unit,
          required,
          tanaman_kategori
        `)
        .eq('activity_type_id', activityTypeId)
      
      if (stageId) {
        query = query.eq('stage_id', stageId)
      } else {
        query = query.is('stage_id', null)
      }
      
      const { data, error } = await query
      
      if (error) throw error
      
      // Calculate quantities
      const calculatedMaterials = data.map(mat => {
        const dosisAsli = mat.default_dosis
        
        // Calculate for PC blocks
        const pcBlocks = blocks.filter(b => 
          (b.tanaman_kategori || 'PC') === 'PC' && 
          (!mat.tanaman_kategori || mat.tanaman_kategori === 'PC')
        )
        const luasPC = pcBlocks.reduce((sum, b) => sum + parseFloat(b.luas_blok || 0), 0)
        const totalPC = luasPC * dosisAsli
        
        // Calculate for RC blocks
        const rcBlocks = blocks.filter(b => 
          b.tanaman_kategori === 'RC' && 
          (!mat.tanaman_kategori || mat.tanaman_kategori === 'RC')
        )
        const luasRC = rcBlocks.reduce((sum, b) => sum + parseFloat(b.luas_blok || 0), 0)
        const totalRC = luasRC * dosisAsli
        
        return {
          material_id: mat.material_id,
          unit: mat.unit,
          grandTotal: totalPC + totalRC
        }
      })
      
      return calculatedMaterials.filter(m => m.grandTotal > 0)
      
    } catch (err) {
      console.error('Error fetching SOP materials:', err)
      return []
    }
  }

  const handleSavePlan = async () => {
    // Validation
    if (!formData.section_id || !formData.activity_type_id) {
      alert('❌ Section dan Activity harus diisi!')
      return
    }

    if (selectedBlocks.length === 0) {
      alert('❌ Pilih minimal 1 blok!')
      return
    }

    // NEW: Validate stage if required
    if (availableStages.length > 0 && !selectedStage) {
      alert('❌ Silakan pilih stage/metode terlebih dahulu')
      return
    }

    const selectedActivityData = activities.find(a => a.id === formData.activity_type_id)

    try {
      setLoading(true)

      // 1. Insert activity plan
      const { data: plan, error: planError } = await supabase
        .from('activity_plans')
        .insert({
          section_id: formData.section_id,
          activity_type_id: formData.activity_type_id,
          vendor_id: formData.vendor_id || null,
          target_bulan: formData.target_bulan,
          stage_id: selectedStage || null,
          status: 'pending',
          created_by: user.id
        })
        .select()
        .single()

      if (planError) throw planError

      // 2. Insert block activities
      const blockActivities = selectedBlocks.map(block => ({
        activity_plan_id: plan.id,
        block_id: block.id,
        luas_total: block.luas_blok,
        luas_completed: 0,
        luas_remaining: block.luas_blok,
        status: 'planned'
      }))

      const { error: blockError } = await supabase
        .from('block_activities')
        .insert(blockActivities)

      if (blockError) throw blockError

      // 3. Calculate and insert planned materials
      const materials = await fetchSOPMaterials(
        formData.activity_type_id,
        selectedStage,
        selectedBlocks
      )

      if (materials.length > 0) {
        const plannedMaterials = materials.map(mat => ({
          activity_plan_id: plan.id,
          material_id: mat.material_id,
          total_quantity: mat.grandTotal,
          allocated_quantity: 0,
          remaining_quantity: mat.grandTotal,
          unit: mat.unit
        }))

        const { error: pmError } = await supabase
          .from('planned_materials')
          .insert(plannedMaterials)

        if (pmError) throw pmError
      }

      alert('✅ Rencana kerja berhasil dibuat!')
      setShowModal(false)
      setSelectedBlocks([])
      setSelectedActivity(null)
      setSelectedStage(null)
      fetchPlans()

    } catch (err) {
      console.error('Error creating plan:', err)
      alert('❌ Error: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDeletePlan = async (id) => {
    if (!confirm('Yakin hapus rencana ini?')) return

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
        <button
          onClick={handleNewPlan}
          className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
        >
          + Buat Rencana Baru
        </button>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="border-b">
          <div className="flex space-x-4 px-6">
            <button
              onClick={() => setActiveTab('plans')}
              className={`py-4 px-2 border-b-2 font-medium ${
                activeTab === 'plans'
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Daftar Rencana
            </button>
            <button
              onClick={() => setActiveTab('materials')}
              className={`py-4 px-2 border-b-2 font-medium ${
                activeTab === 'materials'
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Ringkasan Material
            </button>
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'plans' ? (
            <div className="space-y-4">
              {loading ? (
                <div className="text-center py-8">Loading...</div>
              ) : plans.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  Belum ada rencana kerja
                </div>
              ) : (
                plans.map(plan => (
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
                            plan.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                            plan.status === 'approved' ? 'bg-green-100 text-green-700' :
                            plan.status === 'rejected' ? 'bg-red-100 text-red-700' :
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
                      <div className="flex space-x-2">
                        {plan.status === 'pending' && (
                          <button
                            onClick={() => handleDeletePlan(plan.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {loading ? (
                <div className="text-center py-8">Loading...</div>
              ) : materialSummary.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  Belum ada data material
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Section</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Terpakai</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sisa</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">%</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {materialSummary.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-3 text-sm">{item.material_name}</td>
                          <td className="px-4 py-3 text-sm">{item.section_name}</td>
                          <td className="px-4 py-3 text-sm text-right">{item.total_quantity} {item.unit}</td>
                          <td className="px-4 py-3 text-sm text-right">{item.allocated_quantity} {item.unit}</td>
                          <td className="px-4 py-3 text-sm text-right">{item.remaining_quantity} {item.unit}</td>
                          <td className="px-4 py-3 text-sm text-right">{item.usage_percentage}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-6">Buat Rencana Kerja Baru</h2>
              
              <form onSubmit={(e) => { e.preventDefault(); handleSavePlan(); }} className="space-y-6">
                {/* SECTION */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Section *
                  </label>
                  <select
                    value={formData.section_id}
                    onChange={(e) => setFormData({ ...formData, section_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                    disabled={user.role !== 'admin'}
                  >
                    <option value="">-- Pilih Section --</option>
                    {sections.map(section => (
                      <option key={section.id} value={section.id}>
                        {section.name}
                      </option>
                    ))}
                  </select>
                </div>
                
                {/* ACTIVITY */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Jenis Kegiatan *
                  </label>
                  <select
                    value={formData.activity_type_id}
                    onChange={handleActivityChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  >
                    <option value="">-- Pilih Kegiatan --</option>
                    {activities.map(activity => (
                      <option key={activity.id} value={activity.id}>
                        {activity.name}
                      </option>
                    ))}
                  </select>
                </div>
                
                {/* STAGE (CONDITIONAL) */}
                {filteredStages.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Stage/Metode *
                    </label>
                    <select
                      value={selectedStage || ''}
                      onChange={handleStageChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      required
                    >
                      <option value="">-- Pilih Stage --</option>
                      {filteredStages.map(stage => (
                        <option key={stage.id} value={stage.id}>
                          {stage.name}
                          {stage.for_kategori && ` (${stage.for_kategori} only)`}
                        </option>
                      ))}
                    </select>
                    
                    {hasMixedKategori && (
                      <p className="mt-2 text-sm text-yellow-600">
                        ⚠️ Anda memilih blok PC dan RC. Hanya stage yang kompatibel yang ditampilkan.
                      </p>
                    )}
                  </div>
                )}
                
                {/* TARGET MONTH */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Target Bulan *
                  </label>
                  <input
                    type="month"
                    value={formData.target_bulan.slice(0, 7)}
                    onChange={(e) => setFormData({ ...formData, target_bulan: e.target.value + '-01' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  />
                </div>
                
                {/* BLOCK SELECTION */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Pilih Blok *
                  </label>
                  <div className="border border-gray-300 rounded-md p-4 max-h-64 overflow-y-auto">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {blocks
                        .filter(b => !formData.section_id || b.section_id === formData.section_id)
                        .map(block => (
                          <label
                            key={block.id}
                            className={`flex items-center space-x-2 p-2 rounded cursor-pointer ${
                              selectedBlocks.some(b => b.id === block.id)
                                ? 'bg-green-100 border-green-500 border-2'
                                : 'bg-gray-50 border border-gray-200 hover:bg-gray-100'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedBlocks.some(b => b.id === block.id)}
                              onChange={() => handleBlockToggle(block)}
                              className="rounded text-green-600"
                            />
                            <span className="text-sm">
                              {block.kode_blok}
                              <span className="text-xs text-gray-500 ml-1">
                                ({block.luas_blok} Ha)
                              </span>
                              {block.tanaman_kategori && (
                                <span className={`ml-1 text-xs px-1 rounded ${
                                  block.tanaman_kategori === 'PC' 
                                    ? 'bg-green-100 text-green-700' 
                                    : 'bg-blue-100 text-blue-700'
                                }`}>
                                  {block.tanaman_kategori}
                                </span>
                              )}
                            </span>
                          </label>
                        ))}
                    </div>
                  </div>
                  {selectedBlocks.length > 0 && (
                    <p className="mt-2 text-sm text-gray-600">
                      {selectedBlocks.length} blok dipilih • 
                      Total: {(blockSummary.PC.luas + blockSummary.RC.luas).toFixed(2)} Ha
                      {blockSummary.PC.count > 0 && ` (PC: ${blockSummary.PC.luas.toFixed(2)} Ha)`}
                      {blockSummary.RC.count > 0 && ` (RC: ${blockSummary.RC.luas.toFixed(2)} Ha)`}
                    </p>
                  )}
                </div>
                
                {/* MATERIAL PREVIEW */}
                {selectedBlocks.length > 0 && selectedActivity && (
                  <MaterialPreview
                    activityTypeId={selectedActivity}
                    stageId={selectedStage}
                    selectedBlocks={selectedBlocks}
                  />
                )}
                
                {/* BUTTONS */}
                <div className="flex justify-end space-x-3 pt-4 border-t">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false)
                      setSelectedBlocks([])
                      setSelectedActivity(null)
                      setSelectedStage(null)
                    }}
                    className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400"
                  >
                    {loading ? 'Menyimpan...' : '✓ Simpan Rencana'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}