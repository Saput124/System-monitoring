import { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabase'
import MaterialPreview from './MaterialPreview'

export default function WorkPlanRegistration({ user }) {
  const [activeTab, setActiveTab] = useState('rencana')
  const [showModal, setShowModal] = useState(false)
  
  // Master data
  const [sections, setSections] = useState([])
  const [activities, setActivities] = useState([])
  const [vendors, setVendors] = useState([])
  const [blocks, setBlocks] = useState([])
  const [stages, setStages] = useState([])
  const [plans, setPlans] = useState([])
  const [materialSummary, setMaterialSummary] = useState([])
  
  // Form state
  const [formData, setFormData] = useState({
    section_id: user.section_id || '',
    activity_id: '',
    vendor_id: '',
    target_date: new Date().toISOString().slice(0, 10),
    stage_id: '',
    selectedBlocks: []
  })
  
  // Block summary
  const [blockSummary, setBlockSummary] = useState({ PC: { count: 0, luas: 0 }, RC: { count: 0, luas: 0 } })
  
  useEffect(() => {
    fetchMasterData()
    fetchPlans()
    if (activeTab === 'material') fetchMaterialSummary()
  }, [activeTab])
  
  useEffect(() => {
    if (formData.activity_type_id) {
      fetchStages()
      checkVendorRequirement()
    }
  }, [formData.activity_type_id, blockSummary])
  
  useEffect(() => {
    calculateBlockSummary()
  }, [formData.selectedBlocks])
  
  const fetchMasterData = async () => {
    const [s, a, v, b] = await Promise.all([
      supabase.from('sections').select('*').eq('active', true),
      supabase.from('activities').select('*, sections(name)').eq('active', true),
      supabase.from('vendors').select('*').eq('active', true),
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
    
    let query = supabase
      .from('activity_stages')
      .select('*')
      .eq('activity_id', formData.activity_id)
      .order('sequence_order')
    
    // Filter by kategori
    if (hasPC && !hasRC) {
      query = query.in('kategori', ['PC', 'ALL'])
    } else if (hasRC && !hasPC) {
      query = query.in('kategori', ['RC', 'ALL'])
    }
    
    const { data } = await query
    setStages(data || [])
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
    
    // If stages available but none selected
    if (stages.length > 0 && !formData.stage_id) {
      errors.push('Pilih salah satu stage yang tersedia')
    }
    
    return errors
  }
  
  const handleSubmit = async () => {
    const errors = validateForm()
    if (errors.length > 0) {
      alert('❌ Error:\n\n' + errors.join('\n'))
      return
    }
    
    // Create activity plan
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
    
    await supabase.from('block_activities').insert(blockActivities)
    
    // Calculate materials if stage selected
    if (formData.stage_id) {
      await calculateAndInsertMaterials(plan.id)
    }
    
    alert('✅ Rencana berhasil dibuat!')
    setShowModal(false)
    fetchPlans()
    handleNewPlan()
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
    setFormData({
      section_id: user.section_id || '',
      activity_type_id: '',
      vendor_id: '',
      target_bulan: new Date().toISOString().slice(0, 7) + '-01',
      stage_id: '',
      selectedBlocks: []
    })
    setShowModal(true)
  }
  
  const handleNewPlan = () => {
    setFormData({
      section_id: user.section_id || '',
      activity_id: '',
      vendor_id: '',
      target_date: new Date().toISOString().slice(0, 10),
      stage_id: '',
      selectedBlocks: []
    })
    setStages([])
    setShowModal(true)
  }
  
  const selectedActivity = activities.find(a => a.id === formData.activity_id)
  const showStageDropdown = stages.length > 0
  const hasNoStage = !showStageDropdown && selectedActivity?.requires_material
  
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Work Plan Registration</h1>
      
      <div className="bg-white rounded-lg shadow">
        <div className="border-b">
          <div className="flex space-x-4">
            <button
              onClick={() => setActiveTab('rencana')}
              className={`px-6 py-3 text-sm font-medium ${activeTab === 'rencana' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
            >
              📋 Rencana Kerja
            </button>
            <button
              onClick={() => setActiveTab('material')}
              className={`px-6 py-3 text-sm font-medium ${activeTab === 'material' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
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
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  + Buat Rencana Baru
                </button>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Activity</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stage</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Section</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bulan</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {plans.map(plan => (
                      <tr key={plan.id}>
                        <td className="px-4 py-3 text-sm font-medium">{plan.activities?.name}</td>
                        <td className="px-4 py-3 text-sm">{plan.activity_stages?.name || '-'}</td>
                        <td className="px-4 py-3 text-sm">{plan.sections?.name}</td>
                        <td className="px-4 py-3 text-sm">{plan.vendors?.name || '-'}</td>
                        <td className="px-4 py-3 text-sm">{new Date(plan.target_date).toLocaleDateString('id-ID')}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 rounded text-xs ${
                            plan.status === 'completed' ? 'bg-green-100 text-green-800' :
                            plan.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {plan.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
      
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto m-4">
            <h2 className="text-xl font-bold mb-4">Buat Rencana Kerja Baru</h2>
            
            <div className="space-y-4">
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
                  <label className="block text-sm font-medium mb-1">Target Tanggal *</label>
                  <input
                    type="date"
                    value={formData.target_date}
                    onChange={(e) => setFormData({...formData, target_date: e.target.value})}
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Activity *</label>
                <select
                  value={formData.activity_id}
                  onChange={(e) => setFormData({...formData, activity_id: e.target.value, stage_id: ''})}
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="">Pilih Activity</option>
                  {activities.filter(a => a.section_id === formData.section_id).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
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
                    className="w-full px-3 py-2 border rounded"
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
                  {blocks.map(block => (
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
                  ))}
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
                onClick={() => setShowModal(false)}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                onClick={handleSubmit}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Simpan Rencana
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
