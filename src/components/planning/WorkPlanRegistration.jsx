import { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabase'
import MaterialPreview from './MaterialPreview'

export default function WorkPlanRegistration({ user }) {
  const [activeTab, setActiveTab] = useState('rencana')
  const [showModal, setShowModal] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editingPlanId, setEditingPlanId] = useState(null)
  
  // Master data
  const [sections, setSections] = useState([])
  const [activities, setActivities] = useState([])
  const [vendors, setVendors] = useState([])
  const [blocks, setBlocks] = useState([])
  const [stages, setStages] = useState([])
  const [plans, setPlans] = useState([])
  const [materialSummary, setMaterialSummary] = useState([])
  
  // 🔥 NEW: Kawasan filter
  const [selectedKawasan, setSelectedKawasan] = useState('')
  const [availableKawasan, setAvailableKawasan] = useState([])
  
  // Form state
  const [formData, setFormData] = useState({
    section_id: user.section_id || '',
    activity_id: '',
    vendor_id: '',
    target_date: new Date().toISOString().slice(0, 10),
    stage_id: '',
    selectedBlocks: []
  })
  
  const [expandedPlanId, setExpandedPlanId] = useState(null)
  const [expandedBlockActivities, setExpandedBlockActivities] = useState([])
  
  // Block summary
  const [blockSummary, setBlockSummary] = useState({ PC: { count: 0, luas: 0 }, RC: { count: 0, luas: 0 } })
  
  useEffect(() => {
    fetchMasterData()
    fetchPlans()
  }, [])

  useEffect(() => {
    if (activeTab === 'material') {
      fetchMaterialSummary()
    }
  }, [activeTab])
  
  useEffect(() => {
    if (formData.activity_id) {
      fetchStages()
      checkVendorRequirement()
    } else {
      setStages([])
    }
  }, [formData.activity_id, blockSummary])
  
  useEffect(() => {
    calculateBlockSummary()
  }, [formData.selectedBlocks])
  
  // 🔥 NEW: Extract unique kawasan from blocks
  useEffect(() => {
    if (blocks.length > 0) {
      const uniqueKawasan = [...new Set(blocks.map(b => b.kawasan))].filter(Boolean).sort()
      setAvailableKawasan(uniqueKawasan)
    }
  }, [blocks])
  
  const fetchMasterData = async () => {
    const [s, a, v, b] = await Promise.all([
      supabase.from('sections').select('*').eq('active', true).order('name'),
      supabase.from('activities').select('*, sections(name)').eq('active', true).order('name'),
      supabase.from('vendors').select('*').eq('active', true).order('name'),
      supabase.from('blocks').select('*').eq('active', true).order('code')
    ])
    setSections(s.data || [])
    setActivities(a.data || [])
    setVendors(v.data || [])
    setBlocks(b.data || [])
  }
  
  const fetchStages = async () => {
    const { PC, RC } = blockSummary
    const hasPC = PC.count > 0
    const hasRC = RC.count > 0
    
    const { data } = await supabase
      .from('activity_materials')
      .select('stage_id, activity_stages(id, name, kategori, sequence_order)')
      .eq('activity_id', formData.activity_id)
      .not('stage_id', 'is', null)
    
    if (!data || data.length === 0) {
      setStages([])
      return
    }
    
    const stageMap = new Map()
    data.forEach(row => {
      if (row.activity_stages && !stageMap.has(row.activity_stages.id)) {
        stageMap.set(row.activity_stages.id, row.activity_stages)
      }
    })
    
    let uniqueStages = Array.from(stageMap.values())
    
    if (hasPC && !hasRC) {
      uniqueStages = uniqueStages.filter(s => s.kategori === 'PC' || s.kategori === 'ALL')
    } else if (hasRC && !hasPC) {
      uniqueStages = uniqueStages.filter(s => s.kategori === 'RC' || s.kategori === 'ALL')
    }
    
    uniqueStages.sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0))
    setStages(uniqueStages)
  }
  
  const checkVendorRequirement = async () => {
    const activity = activities.find(a => a.id === formData.activity_id)
    if (activity?.requires_vendor) {
      const { data } = await supabase
        .from('vendor_assignments')
        .select('vendor_id')
        .eq('section_id', formData.section_id)
        .eq('activity_id', formData.activity_id)
        .single()
      
      if (data) {
        setFormData(prev => ({ ...prev, vendor_id: data.vendor_id }))
      }
    }
  }
  
  const calculateBlockSummary = () => {
    const selected = blocks.filter(b => formData.selectedBlocks.includes(b.id))
    const summary = {
      PC: { count: 0, luas: 0, blocks: [] },
      RC: { count: 0, luas: 0, blocks: [] }
    }
    
    selected.forEach(block => {
      if (block.kategori === 'PC') {
        summary.PC.count++
        summary.PC.luas += parseFloat(block.luas_total)
        summary.PC.blocks.push(block)
      } else if (block.kategori === 'RC') {
        summary.RC.count++
        summary.RC.luas += parseFloat(block.luas_total)
        summary.RC.blocks.push(block)
      }
    })
    
    setBlockSummary(summary)
  }
  
  const fetchPlans = async () => {
    let query = supabase
      .from('activity_plans')
      .select(`
        *,
        sections(name),
        activities(name),
        vendors(name),
        activity_stages(name)
      `)
      .order('created_at', { ascending: false })
    
    if (user.role === 'section_head') {
      query = query.eq('section_id', user.section_id)
    }
    
    const { data } = await query
    setPlans(data || [])
  }
  
  const fetchMaterialSummary = async () => {
    let query = supabase.from('v_material_usage_summary').select('*')
    
    if (user.role === 'section_head') {
      query = query.eq('section_id', user.section_id)
    }
    
    const { data } = await query
    setMaterialSummary(data || [])
  }
  
  const fetchExpandedBlockActivities = async (planId) => {
    const { data } = await supabase
      .from('block_activities')
      .select('*, blocks(code, name, kawasan, luas_total, kategori)')
      .eq('activity_plan_id', planId)
      .order('created_at')
    setExpandedBlockActivities(data || [])
  }
  
  const handleToggleExpand = async (planId) => {
    if (expandedPlanId === planId) {
      setExpandedPlanId(null)
      setExpandedBlockActivities([])
    } else {
      setExpandedPlanId(planId)
      await fetchExpandedBlockActivities(planId)
    }
  }
  
  const handleBlockToggle = (blockId) => {
    setFormData(prev => ({
      ...prev,
      selectedBlocks: prev.selectedBlocks.includes(blockId)
        ? prev.selectedBlocks.filter(id => id !== blockId)
        : [...prev.selectedBlocks, blockId]
    }))
  }
  
  const validateForm = () => {
    const errors = []
    
    if (!formData.activity_id) {
      errors.push('Pilih activity terlebih dahulu')
    }
    
    if (formData.selectedBlocks.length === 0) {
      errors.push('Pilih minimal 1 blok')
    }
    
    if (stages.length > 0 && !formData.stage_id) {
      errors.push('Pilih salah satu stage yang tersedia')
    }
    
    return errors
  }
  
  // 🔥 NEW: Load plan data for editing
  const handleEditPlan = async (plan) => {
    setEditMode(true)
    setEditingPlanId(plan.id)
    
    // Fetch block activities untuk plan ini
    const { data: blockActivities } = await supabase
      .from('block_activities')
      .select('block_id')
      .eq('activity_plan_id', plan.id)
    
    const selectedBlockIds = blockActivities?.map(ba => ba.block_id) || []
    
    setFormData({
      section_id: plan.section_id,
      activity_id: plan.activity_id,
      vendor_id: plan.vendor_id || '',
      target_date: plan.target_date,
      stage_id: plan.stage_id || '',
      selectedBlocks: selectedBlockIds
    })
    
    setShowModal(true)
  }
  
  // 🔥 NEW: Delete plan with validation
  const handleDeletePlan = async (plan) => {
    // Check if ada transaksi
    const { data: transactions } = await supabase
      .from('transactions')
      .select('id')
      .eq('activity_plan_id', plan.id)
      .limit(1)
    
    if (transactions && transactions.length > 0) {
      alert('❌ Tidak dapat menghapus rencana yang sudah memiliki transaksi!\n\nSilakan hubungi admin untuk bantuan.')
      return
    }
    
    const confirmed = confirm(
      `⚠️ KONFIRMASI HAPUS\n\n` +
      `Apakah Anda yakin ingin menghapus rencana ini?\n\n` +
      `Activity: ${plan.activities?.name}\n` +
      `Section: ${plan.sections?.name}\n` +
      `Target: ${new Date(plan.target_date).toLocaleDateString('id-ID')}\n\n` +
      `Data block activities dan planned materials juga akan terhapus.`
    )
    
    if (!confirmed) return
    
    try {
      // Delete cascade: planned_materials, block_activities, activity_plans
      await supabase.from('planned_materials').delete().eq('activity_plan_id', plan.id)
      await supabase.from('block_activities').delete().eq('activity_plan_id', plan.id)
      const { error } = await supabase.from('activity_plans').delete().eq('id', plan.id)
      
      if (error) throw error
      
      alert('✅ Rencana berhasil dihapus!')
      await fetchPlans()
      
    } catch (error) {
      console.error('Error deleting plan:', error)
      alert(`❌ Gagal menghapus rencana: ${error.message}`)
    }
  }
  
  const handleSubmit = async () => {
    const errors = validateForm()
    if (errors.length > 0) {
      alert('❌ Error:\n\n' + errors.join('\n'))
      return
    }
    
    try {
      if (editMode) {
        // 🔥 UPDATE MODE
        // Check if ada transaksi
        const { data: transactions } = await supabase
          .from('transactions')
          .select('id')
          .eq('activity_plan_id', editingPlanId)
          .limit(1)
        
        if (transactions && transactions.length > 0) {
          alert('❌ Tidak dapat mengubah rencana yang sudah memiliki transaksi!')
          return
        }
        
        // Update activity plan
        const { error: planError } = await supabase
          .from('activity_plans')
          .update({
            section_id: formData.section_id,
            activity_id: formData.activity_id,
            vendor_id: formData.vendor_id || null,
            target_date: formData.target_date,
            stage_id: formData.stage_id || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingPlanId)
        
        if (planError) throw planError
        
        // Delete existing block activities dan planned materials
        await supabase.from('block_activities').delete().eq('activity_plan_id', editingPlanId)
        await supabase.from('planned_materials').delete().eq('activity_plan_id', editingPlanId)
        
        // Insert new block activities
        const blockActivities = formData.selectedBlocks.map(blockId => {
          const block = blocks.find(b => b.id === blockId)
          return {
            activity_plan_id: editingPlanId,
            block_id: blockId,
            luas_total: block.luas_total,
            luas_remaining: block.luas_total,
            status: 'planned'
          }
        })
        
        await supabase.from('block_activities').insert(blockActivities)
        
        // Recalculate materials if stage selected
        if (formData.stage_id) {
          await calculateAndInsertMaterials(editingPlanId)
        }
        
        alert('✅ Rencana berhasil diupdate!')
        
      } else {
        // 🔥 CREATE MODE
        const { data: plan, error: planError } = await supabase
          .from('activity_plans')
          .insert({
            section_id: formData.section_id,
            activity_id: formData.activity_id,
            vendor_id: formData.vendor_id || null,
            target_date: formData.target_date,
            stage_id: formData.stage_id || null,
            status: 'approved',
            created_by: user.id
          })
          .select()
          .single()
        
        if (planError) throw planError
        
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
        
        await supabase.from('block_activities').insert(blockActivities)
        
        // Calculate materials if stage selected
        if (formData.stage_id) {
          await calculateAndInsertMaterials(plan.id)
        }
        
        alert('✅ Rencana berhasil dibuat!')
      }
      
      setShowModal(false)
      setEditMode(false)
      setEditingPlanId(null)
      await fetchPlans()
      handleNewPlan()
      
    } catch (error) {
      console.error('Error saving plan:', error)
      alert(`❌ Gagal menyimpan rencana: ${error.message}`)
    }
  }
  
  const calculateAndInsertMaterials = async (planId) => {
    const { data: sopMaterials } = await supabase
      .from('activity_materials')
      .select('*, materials(code, name, unit)')
      .eq('activity_id', formData.activity_id)
      .eq('stage_id', formData.stage_id)
    
    if (!sopMaterials || sopMaterials.length === 0) return
    
    const materialGroups = {}
    
    formData.selectedBlocks.forEach(blockId => {
      const block = blocks.find(b => b.id === blockId)
      if (!block) return
      
      sopMaterials.forEach(sop => {
        const key = sop.material_id
        if (!materialGroups[key]) {
          materialGroups[key] = {
            material_id: sop.material_id,
            total_quantity: 0,
            unit: sop.unit
          }
        }
        
        const quantity = parseFloat(sop.default_dosis) * parseFloat(block.luas_total)
        materialGroups[key].total_quantity += quantity
      })
    })
    
    const plannedMaterials = Object.values(materialGroups).map(m => ({
      activity_plan_id: planId,
      material_id: m.material_id,
      total_quantity: parseFloat(m.total_quantity.toFixed(3)),
      remaining_quantity: parseFloat(m.total_quantity.toFixed(3)),
      unit: m.unit
    }))
    
    if (plannedMaterials.length > 0) {
      await supabase.from('planned_materials').insert(plannedMaterials)
    }
  }
  
  const handleNewPlan = () => {
    setEditMode(false)
    setEditingPlanId(null)
    setFormData({
      section_id: user.section_id || '',
      activity_id: '',
      vendor_id: '',
      target_date: new Date().toISOString().slice(0, 10),
      stage_id: '',
      selectedBlocks: []
    })
    setStages([])
    setSelectedKawasan('')
    setShowModal(true)
  }
  
  // 🔥 NEW: Filter blocks berdasarkan kawasan
  const filteredBlocks = selectedKawasan 
    ? blocks.filter(b => b.kawasan === selectedKawasan)
    : blocks
  
  const selectedActivity = activities.find(a => a.id === formData.activity_id)
  const showStageDropdown = stages.length > 0
  const hasNoStage = !showStageDropdown && selectedActivity?.requires_material
  
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">📋 Work Plan Registration</h1>
      
      <div className="bg-white rounded-lg shadow">
        <div className="border-b">
          <div className="flex space-x-4">
            <button
              onClick={() => setActiveTab('rencana')}
              className={`px-6 py-3 text-sm font-medium ${activeTab === 'rencana' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}
            >
              📋 Rencana Kerja
            </button>
            <button
              onClick={() => setActiveTab('material')}
              className={`px-6 py-3 text-sm font-medium ${activeTab === 'material' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}
            >
              🧪 Rencana Material
            </button>
          </div>
        </div>
        
        <div className="p-6">
          {activeTab === 'rencana' ? (
            <>
              <div className="flex justify-between items-center mb-4">
                <button
                  onClick={handleNewPlan}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2"
                >
                  <span>+</span> Buat Rencana Baru
                </button>
              </div>
              
              {plans.length === 0 ? (
                <div className="text-center py-12 text-gray-500 bg-gray-50 rounded border-2 border-dashed">
                  <div className="text-4xl mb-2">📋</div>
                  <div>Belum ada rencana kerja</div>
                </div>
              ) : (
                <div className="space-y-2">
                  {plans.map(plan => {
                    const isExpanded = expandedPlanId === plan.id
                    
                    // Only calculate stats for the currently expanded plan
                    const totalLuas = isExpanded ? expandedBlockActivities.reduce((s, ba) => s + parseFloat(ba.luas_total || 0), 0) : 0
                    const totalSelesai = isExpanded ? expandedBlockActivities.reduce((s, ba) => s + parseFloat(ba.luas_completed || 0), 0) : 0
                    const totalSisa = totalLuas - totalSelesai
                    const progressPct = totalLuas > 0 ? (totalSelesai / totalLuas) * 100 : 0
                    const blokSelesai = isExpanded ? expandedBlockActivities.filter(ba => ba.status === 'completed').length : 0
                    
                    return (
                      <div key={plan.id} className="border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-4 p-4">
                          <button
                            onClick={() => handleToggleExpand(plan.id)}
                            className="text-gray-400 text-sm w-4 hover:text-gray-600"
                          >
                            {isExpanded ? '▼' : '▶'}
                          </button>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm">{plan.activities?.name}</span>
                              {plan.activity_stages?.name && (
                                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">{plan.activity_stages.name}</span>
                              )}
                              <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                                plan.status === 'completed' ? 'bg-green-100 text-green-800' :
                                plan.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-blue-100 text-blue-800'
                              }`}>
                                {plan.status === 'completed' ? 'Selesai' : plan.status === 'in_progress' ? 'Sedang Dikerjakan' : 'Approved'}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              {plan.sections?.name}
                              {plan.vendors?.name && ` · ${plan.vendors.name}`}
                              {` · Target: ${new Date(plan.target_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`}
                            </div>
                          </div>
                          
                          {/* 🔥 NEW: Edit & Delete buttons */}
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEditPlan(plan)}
                              className="px-3 py-1 text-xs bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 font-medium"
                              title="Edit rencana"
                            >
                              ✏️ Edit
                            </button>
                            <button
                              onClick={() => handleDeletePlan(plan)}
                              className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 font-medium"
                              title="Hapus rencana"
                            >
                              🗑️ Hapus
                            </button>
                          </div>
                        </div>
                        
                        {isExpanded && (
                          <div className="border-t bg-gray-50 p-4 space-y-4">
                            <div className="bg-white rounded-lg border p-4">
                              <div className="flex justify-between text-sm mb-2">
                                <span className="font-medium text-gray-700">Progress Keseluruhan</span>
                                <span className="text-gray-500">{blokSelesai} dari {expandedBlockActivities.length} blok selesai</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2.5 mb-3">
                                <div className="bg-green-500 h-2.5 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                              </div>
                              <div className="grid grid-cols-3 gap-3 text-center">
                                <div className="bg-gray-50 rounded p-2">
                                  <div className="text-xs text-gray-500">Total Luas</div>
                                  <div className="text-sm font-semibold text-gray-800">{totalLuas.toFixed(2)} Ha</div>
                                </div>
                                <div className="bg-green-50 rounded p-2">
                                  <div className="text-xs text-green-600">Selesai</div>
                                  <div className="text-sm font-semibold text-green-700">{totalSelesai.toFixed(2)} Ha</div>
                                </div>
                                <div className="bg-orange-50 rounded p-2">
                                  <div className="text-xs text-orange-600">Sisa</div>
                                  <div className="text-sm font-semibold text-orange-700">{totalSisa.toFixed(2)} Ha</div>
                                </div>
                              </div>
                            </div>
                            
                            <div>
                              <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Blok Kerja</div>
                              <div className="space-y-2">
                                {expandedBlockActivities.map(ba => {
                                  const baCompleted = parseFloat(ba.luas_completed || 0)
                                  const baTotal = parseFloat(ba.luas_total || 0)
                                  const baSisa = Math.max(0, baTotal - baCompleted)
                                  const blokProgress = baTotal > 0 ? (baCompleted / baTotal) * 100 : 0
                                  return (
                                    <div key={ba.id} className="bg-white border rounded p-3">
                                      <div className="flex justify-between items-start mb-2">
                                        <div>
                                          <div className="text-sm font-medium">{ba.blocks?.code} — {ba.blocks?.name}</div>
                                          <div className="text-xs text-gray-500">{ba.blocks?.kawasan} · {ba.blocks?.kategori}</div>
                                        </div>
                                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                                          ba.status === 'completed' ? 'bg-green-100 text-green-800' :
                                          ba.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                                          'bg-gray-100 text-gray-600'
                                        }`}>
                                          {ba.status === 'completed' ? 'Selesai' : ba.status === 'in_progress' ? 'Dikerjakan' : 'Planned'}
                                        </span>
                                      </div>
                                      <div className="w-full bg-gray-200 rounded-full h-1.5 mb-2">
                                        <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${blokProgress}%` }} />
                                      </div>
                                      <div className="flex gap-4 text-xs text-gray-600">
                                        <span>Total: <span className="font-medium text-gray-800">{baTotal.toFixed(2)} Ha</span></span>
                                        <span>Selesai: <span className="font-medium text-green-700">{baCompleted.toFixed(2)} Ha</span></span>
                                        <span>Sisa: <span className="font-medium text-orange-700">{baSisa.toFixed(2)} Ha</span></span>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <h3 className="font-semibold">Material Summary by Activity</h3>
              {materialSummary.length === 0 ? (
                <div className="text-center py-8 text-gray-500">Belum ada rencana material</div>
              ) : (
                <div className="space-y-4">
                  {materialSummary.map(item => (
                    <div key={item.id} className="border rounded p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-medium">{item.activity_name}</div>
                          <div className="text-sm text-gray-600">{item.material_name}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-gray-600">Total: {item.total_quantity} {item.unit}</div>
                          <div className="text-sm font-medium text-green-600">Sisa: {item.remaining_quantity} {item.unit}</div>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: `${item.usage_percentage}%` }}
                        />
                      </div>
                      <div className="text-xs text-gray-600 mt-1">{item.usage_percentage}% terpakai</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Modal Form */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto m-4">
            <h2 className="text-xl font-bold mb-4">
              {editMode ? '✏️ Edit Rencana Kerja' : '📋 Buat Rencana Kerja Baru'}
            </h2>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Section *</label>
                  <select
                    value={formData.section_id}
                    onChange={(e) => setFormData({...formData, section_id: e.target.value})}
                    className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
                    disabled={user.role === 'section_head'}
                  >
                    <option value="">Pilih Section</option>
                    {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Target Tanggal *</label>
                  <input
                    type="date"
                    value={formData.target_date}
                    onChange={(e) => setFormData({...formData, target_date: e.target.value})}
                    className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Activity *</label>
                <select
                  value={formData.activity_id}
                  onChange={(e) => setFormData({...formData, activity_id: e.target.value, stage_id: ''})}
                  className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Pilih Activity</option>
                  {activities.filter(a => a.section_id === formData.section_id).map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              
              {formData.activity_id && stages.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm">
                  ✅ Tersedia {stages.length} stage dari Assignment. Pilih salah satu di bawah.
                </div>
              )}
              
              {formData.activity_id && stages.length === 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm">
                  ⚠️ Belum ada stage untuk activity ini. Setup dulu di Assignment!
                </div>
              )}
              
              {selectedActivity?.requires_vendor && (
                <div>
                  <label className="block text-sm font-medium mb-1">Vendor</label>
                  <select
                    value={formData.vendor_id}
                    onChange={(e) => setFormData({...formData, vendor_id: e.target.value})}
                    className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Pilih Vendor</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              )}
              
              {showStageDropdown && (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Stage (pilih salah satu) *
                  </label>
                  <div className="border rounded p-4 space-y-2 max-h-40 overflow-y-auto">
                    {stages.map(s => (
                      <label key={s.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer">
                        <input
                          type="radio"
                          name="stage"
                          checked={formData.stage_id === s.id}
                          onChange={() => setFormData({...formData, stage_id: s.id})}
                          className="w-4 h-4"
                        />
                        <div className="flex-1">
                          <div className="font-medium">{s.name}</div>
                          {s.kategori && s.kategori !== 'ALL' && (
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              s.kategori === 'PC' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                            }`}>
                              {s.kategori} only
                            </span>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              
              {hasNoStage && (
                <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
                  ℹ️ Activity ini menggunakan material default (tidak ada stage selection)
                </div>
              )}
              
              {/* 🔥 NEW: Kawasan Filter */}
              {availableKawasan.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    🗺️ Filter Berdasarkan Kawasan (Opsional)
                  </label>
                  <select
                    value={selectedKawasan}
                    onChange={(e) => setSelectedKawasan(e.target.value)}
                    className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Tampilkan Semua Kawasan</option>
                    {availableKawasan.map(kawasan => (
                      <option key={kawasan} value={kawasan}>{kawasan}</option>
                    ))}
                  </select>
                  {selectedKawasan && (
                    <div className="text-xs text-blue-600 mt-1">
                      Menampilkan blok dari kawasan: {selectedKawasan}
                    </div>
                  )}
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium mb-2">
                  Pilih Blok *
                  {formData.selectedBlocks.length > 0 && (
                    <span className="ml-2 text-xs text-gray-600">
                      ({formData.selectedBlocks.length} blok dipilih)
                    </span>
                  )}
                </label>
                
                {(blockSummary.PC.count > 0 || blockSummary.RC.count > 0) && (
                  <div className="mb-3 p-3 bg-gray-50 rounded">
                    <div className="text-sm font-medium mb-1">Summary:</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {blockSummary.PC.count > 0 && (
                        <div className="flex justify-between">
                          <span className="text-blue-600">Plant Cane (PC):</span>
                          <span className="font-medium">{blockSummary.PC.count} blok, {blockSummary.PC.luas.toFixed(2)} Ha</span>
                        </div>
                      )}
                      {blockSummary.RC.count > 0 && (
                        <div className="flex justify-between">
                          <span className="text-green-600">Ratoon Cane (RC):</span>
                          <span className="font-medium">{blockSummary.RC.count} blok, {blockSummary.RC.luas.toFixed(2)} Ha</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                <div className="border rounded max-h-60 overflow-y-auto">
                  {filteredBlocks.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      Tidak ada blok di kawasan ini
                    </div>
                  ) : (
                    filteredBlocks.map(block => (
                      <label
                        key={block.id}
                        className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                      >
                        <input
                          type="checkbox"
                          checked={formData.selectedBlocks.includes(block.id)}
                          onChange={() => handleBlockToggle(block.id)}
                          className="w-4 h-4"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{block.code}</span>
                            <span className="text-sm text-gray-600">{block.name}</span>
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              block.kategori === 'PC' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                            }`}>
                              {block.kategori}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500">{block.kawasan} · {block.luas_total} Ha</div>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>
              
              {formData.activity_id && formData.selectedBlocks.length > 0 && (
                <MaterialPreview
                  activityId={formData.activity_id}
                  stageId={formData.stage_id}
                  selectedBlocks={formData.selectedBlocks}
                  blocks={blocks}
                />
              )}
            </div>
            
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowModal(false)
                  setEditMode(false)
                  setEditingPlanId(null)
                }}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                onClick={handleSubmit}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                {editMode ? '💾 Update Rencana' : '💾 Simpan Rencana'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
