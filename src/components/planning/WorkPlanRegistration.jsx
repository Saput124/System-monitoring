import { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabase'
import MaterialPreview from './MaterialPreview'

export default function WorkPlanRegistration({ user }) {
  const [activeTab, setActiveTab] = useState('rencana')
  const [showModal, setShowModal] = useState(false)
  
  // Master data
  const [sections, setSections] = useState([])
  const [assignedActivities, setAssignedActivities] = useState([]) // HANYA dari section_activities!
  const [assignedVendor, setAssignedVendor] = useState(null) // LOCKED dari assignment!
  const [blocks, setBlocks] = useState([])
  const [stages, setStages] = useState([])
  const [plans, setPlans] = useState([])
  const [materialSummary, setMaterialSummary] = useState([])
  
  // Form state
  const [formData, setFormData] = useState({
    section_id: user.section_id || '',
    activity_type_id: '',
    vendor_id: '',
    target_bulan: new Date().toISOString().slice(0, 7) + '-01',
    stage_id: '',
    alternative_option: '',
    selectedBlocks: []
  })
  
  // Block summary
  const [blockSummary, setBlockSummary] = useState({ PC: { count: 0, luas: 0 }, RC: { count: 0, luas: 0 } })
  const [availableStages, setAvailableStages] = useState([])
  const [availableAlternatives, setAvailableAlternatives] = useState([])
  
  useEffect(() => {
    fetchMasterData()
    fetchPlans()
    if (activeTab === 'material') fetchMaterialSummary()
  }, [activeTab])
  
  useEffect(() => {
    if (formData.section_id) {
      fetchAssignedActivities()
    }
  }, [formData.section_id])
  
  useEffect(() => {
    if (formData.activity_type_id) {
      checkActivityRequirements()
      fetchAvailableStages()
      fetchAvailableAlternatives()
    } else {
      setAssignedVendor(null)
      setStages([])
      setAvailableAlternatives([])
    }
  }, [formData.activity_type_id, blockSummary])
  
  useEffect(() => {
    calculateBlockSummary()
  }, [formData.selectedBlocks])
  
  const fetchMasterData = async () => {
    const [s, b] = await Promise.all([
      supabase.from('sections').select('*').eq('active', true).order('name'),
      supabase.from('blocks').select('*').eq('active', true).order('code')
    ])
    setSections(s.data || [])
    setBlocks(b.data || [])
  }
  
  // CRITICAL: Hanya ambil activities yang sudah di-assign ke section!
  const fetchAssignedActivities = async () => {
    const { data } = await supabase
      .from('section_activities')
      .select('*, activity_types(*)')
      .eq('section_id', formData.section_id)
      .eq('active', true)
    
    setAssignedActivities(data || [])
    
    // Reset activity selection jika section berubah
    setFormData(prev => ({ 
      ...prev, 
      activity_type_id: '', 
      vendor_id: '',
      stage_id: '',
      alternative_option: ''
    }))
    setAssignedVendor(null)
  }
  
  // CRITICAL: Cek apakah activity butuh vendor dan auto-assign dari vendor_assignments
  const checkActivityRequirements = async () => {
    const activity = assignedActivities.find(
      sa => sa.activity_type_id === formData.activity_type_id
    )?.activity_types
    
    if (!activity) return
    
    if (activity.requires_vendor) {
      // WAJIB ambil dari vendor_assignments
      const { data, error } = await supabase
        .from('vendor_assignments')
        .select('vendor_id, vendors(id, code, name)')
        .eq('section_id', formData.section_id)
        .eq('activity_type_id', formData.activity_type_id)
        .eq('active', true)
        .single()
      
      if (!data || error) {
        alert(`❌ VALIDASI GAGAL!\n\nTidak ada vendor yang di-assign untuk activity "${activity.name}" di section ini.\n\nHubungi admin untuk assign vendor di menu Assignment Management.`)
        setFormData(prev => ({ ...prev, activity_type_id: '', vendor_id: '' }))
        setAssignedVendor(null)
        return
      }
      
      // LOCK vendor - user tidak bisa ganti!
      setAssignedVendor(data.vendors)
      setFormData(prev => ({ ...prev, vendor_id: data.vendor_id }))
      
      console.log('✅ Vendor auto-assigned:', data.vendors.name)
    } else {
      // Activity tidak butuh vendor
      setAssignedVendor(null)
      setFormData(prev => ({ ...prev, vendor_id: null }))
    }
  }
  
  // CRITICAL: Ambil stages yang sesuai dengan kategori blok yang dipilih
  const fetchAvailableStages = async () => {
    const { PC, RC } = blockSummary
    const hasPC = PC.count > 0
    const hasRC = RC.count > 0
    
    const activity = assignedActivities.find(
      sa => sa.activity_type_id === formData.activity_type_id
    )?.activity_types
    
    if (!activity || !activity.requires_material) {
      setStages([])
      return
    }
    
    // Ambil distinct stages dari activity_materials
    const { data } = await supabase
      .from('activity_materials')
      .select('stage_id, activity_stages(id, code, name)')
      .eq('activity_type_id', formData.activity_type_id)
    
    if (!data) {
      setStages([])
      return
    }
    
    // Filter stages yang cocok dengan kategori blok
    const uniqueStages = []
    const seenIds = new Set()
    
    data.forEach(item => {
      if (!item.stage_id || seenIds.has(item.stage_id)) return
      
      // Cek apakah stage ini valid untuk kategori yang dipilih
      // Untuk saat ini kita ambil semua, nanti bisa ditambah filter
      seenIds.add(item.stage_id)
      uniqueStages.push(item.activity_stages)
    })
    
    setStages(uniqueStages)
    
    console.log('📋 Available stages:', uniqueStages.length, 'for activity', activity.name)
  }
  
  // CRITICAL: Ambil alternative options yang tersedia
  const fetchAvailableAlternatives = async () => {
    const { data } = await supabase
      .from('activity_materials')
      .select('alternative_option')
      .eq('activity_type_id', formData.activity_type_id)
      .not('alternative_option', 'is', null)
    
    if (!data) {
      setAvailableAlternatives([])
      return
    }
    
    const uniqueAlts = [...new Set(data.map(d => d.alternative_option))]
    setAvailableAlternatives(uniqueAlts)
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
        sections(name, code),
        activity_types(name, code, requires_material, requires_vendor),
        vendors(name, code),
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
    const { PC, RC } = blockSummary
    
    const activity = assignedActivities.find(
      sa => sa.activity_type_id === formData.activity_type_id
    )?.activity_types
    
    if (!formData.section_id) {
      errors.push('Pilih section terlebih dahulu')
    }
    
    if (!formData.activity_type_id) {
      errors.push('Pilih activity terlebih dahulu')
    }
    
    if (formData.selectedBlocks.length === 0) {
      errors.push('Pilih minimal 1 blok')
    }
    
    // Validasi vendor untuk activity yang membutuhkan
    if (activity?.requires_vendor && !formData.vendor_id) {
      errors.push('Vendor diperlukan untuk activity ini')
    }
    
    // Validasi stage untuk activity yang membutuhkan material
    if (activity?.requires_material && stages.length > 0 && !formData.stage_id) {
      errors.push('Pilih stage/metode untuk activity ini')
    }
    
    return errors
  }
  
  const handleSubmit = async () => {
    const errors = validateForm()
    if (errors.length > 0) {
      alert('❌ Error:\n\n' + errors.join('\n'))
      return
    }
    
    const activity = assignedActivities.find(
      sa => sa.activity_type_id === formData.activity_type_id
    )?.activity_types
    
    try {
      // 1. Create activity plan
      const planData = {
        section_id: formData.section_id,
        activity_type_id: formData.activity_type_id,
        vendor_id: formData.vendor_id || null,
        target_bulan: formData.target_bulan,
        stage_id: formData.stage_id || null,
        alternative_option: formData.alternative_option || null,
        status: 'draft',
        created_by: user.id
      }
      
      const { data: plan, error: planError } = await supabase
        .from('activity_plans')
        .insert(planData)
        .select()
        .single()
      
      if (planError) throw planError
      
      // 2. Create block activities
      const blockActivities = formData.selectedBlocks.map(blockId => {
        const block = blocks.find(b => b.id === blockId)
        return {
          activity_plan_id: plan.id,
          block_id: blockId,
          luas_total: block.luas_total,
          status: 'planned'
        }
      })
      
      const { error: blockError } = await supabase
        .from('block_activities')
        .insert(blockActivities)
      
      if (blockError) throw blockError
      
      // 3. Create planned materials (jika activity butuh material)
      if (activity.requires_material) {
        // Ambil material SOP yang sesuai
        let materialQuery = supabase
          .from('activity_materials')
          .select('*')
          .eq('activity_type_id', formData.activity_type_id)
        
        // Filter by stage
        if (formData.stage_id) {
          materialQuery = materialQuery.or(`stage_id.is.null,stage_id.eq.${formData.stage_id}`)
        }
        
        // Filter by alternative
        if (formData.alternative_option) {
          materialQuery = materialQuery.or(`alternative_option.is.null,alternative_option.eq.${formData.alternative_option}`)
        }
        
        const { data: materials } = await materialQuery
        
        if (materials && materials.length > 0) {
          // Hitung total material berdasarkan luas
          const totalLuasPC = blockSummary.PC.luas
          const totalLuasRC = blockSummary.RC.luas
          
          const plannedMaterials = materials.map(m => {
            let totalQty = 0
            
            // Hitung berdasarkan kategori
            if (!m.tanaman_kategori || m.tanaman_kategori === 'PC') {
              totalQty += totalLuasPC * parseFloat(m.default_dosis)
            }
            if (!m.tanaman_kategori || m.tanaman_kategori === 'RC') {
              totalQty += totalLuasRC * parseFloat(m.default_dosis)
            }
            
            return {
              activity_plan_id: plan.id,
              material_id: m.material_id,
              total_quantity: totalQty.toFixed(3),
              unit: m.unit
            }
          })
          
          const { error: matError } = await supabase
            .from('planned_materials')
            .insert(plannedMaterials)
          
          if (matError) throw matError
        }
      }
      
      alert(`✅ Rencana kerja berhasil dibuat!\n\n` +
        `Activity: ${activity.name}\n` +
        `Blok: ${formData.selectedBlocks.length} blok\n` +
        `Total Luas: ${(blockSummary.PC.luas + blockSummary.RC.luas).toFixed(2)} Ha`)
      
      setShowModal(false)
      setFormData({
        section_id: user.section_id || '',
        activity_type_id: '',
        vendor_id: '',
        target_bulan: new Date().toISOString().slice(0, 7) + '-01',
        stage_id: '',
        alternative_option: '',
        selectedBlocks: []
      })
      fetchPlans()
      
    } catch (error) {
      console.error('Error creating plan:', error)
      alert('❌ Error: ' + error.message)
    }
  }
  
  const handleDeletePlan = async (planId) => {
    if (!confirm('Yakin hapus rencana kerja ini? Semua data terkait akan terhapus.')) return
    
    // Cek apakah sudah ada transaksi
    const { data: transactions } = await supabase
      .from('transactions')
      .select('id, block_activities!inner(activity_plan_id)')
      .eq('block_activities.activity_plan_id', planId)
      .limit(1)
    
    if (transactions && transactions.length > 0) {
      alert('❌ Tidak bisa hapus!\n\nSudah ada transaksi yang menggunakan planning ini.')
      return
    }
    
    const { error } = await supabase
      .from('activity_plans')
      .delete()
      .eq('id', planId)
    
    if (!error) {
      alert('✅ Rencana kerja berhasil dihapus')
      fetchPlans()
    } else {
      alert('❌ Error: ' + error.message)
    }
  }
  
  const selectedActivity = assignedActivities.find(
    sa => sa.activity_type_id === formData.activity_type_id
  )?.activity_types
  
  const showStageDropdown = selectedActivity?.requires_material && stages.length > 0
  const hasNoStage = selectedActivity?.requires_material && stages.length === 0

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Registrasi Rencana Kerja</h1>
        <button 
          onClick={() => setShowModal(true)} 
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          + Buat Rencana Baru
        </button>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="border-b">
          <div className="flex space-x-4">
            <button
              onClick={() => setActiveTab('rencana')}
              className={`px-6 py-3 text-sm font-medium ${
                activeTab === 'rencana' 
                  ? 'border-b-2 border-blue-600 text-blue-600' 
                  : 'text-gray-600 hover:text-blue-600'
              }`}
            >
              📋 Rencana Kerja
            </button>
            <button
              onClick={() => setActiveTab('material')}
              className={`px-6 py-3 text-sm font-medium ${
                activeTab === 'material' 
                  ? 'border-b-2 border-blue-600 text-blue-600' 
                  : 'text-gray-600 hover:text-blue-600'
              }`}
            >
              🧪 Material Summary
            </button>
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'rencana' ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm text-gray-600">Total: {plans.length} rencana</div>
              </div>
              
              {plans.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  Belum ada rencana kerja
                </div>
              ) : (
                <div className="space-y-3">
                  {plans.map(plan => (
                    <div key={plan.id} className="border rounded p-4 hover:bg-gray-50">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-medium text-lg">{plan.activity_types.name}</span>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              plan.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                              plan.status === 'approved' ? 'bg-blue-100 text-blue-800' :
                              plan.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                              plan.status === 'completed' ? 'bg-green-100 text-green-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {plan.status}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                            <div>
                              <span className="font-medium">Section:</span> {plan.sections.name}
                            </div>
                            <div>
                              <span className="font-medium">Target:</span> {plan.target_bulan.slice(0, 7)}
                            </div>
                            {plan.vendors && (
                              <div>
                                <span className="font-medium">Vendor:</span> {plan.vendors.name}
                              </div>
                            )}
                            {plan.activity_stages && (
                              <div>
                                <span className="font-medium">Stage:</span> {plan.activity_stages.name}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex gap-2">
                          {plan.status === 'draft' && (
                            <button 
                              onClick={() => handleDeletePlan(plan.id)}
                              className="text-red-600 hover:text-red-800 text-sm"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              {materialSummary.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  Belum ada data material
                </div>
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
                    onChange={(e) => setFormData({...formData, section_id: e.target.value, activity_type_id: '', vendor_id: ''})}
                    className="w-full px-3 py-2 border rounded"
                    disabled={user.role === 'section_head'}
                  >
                    <option value="">Pilih Section</option>
                    {sections.map(s => (
                      <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
                    ))}
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
                <label className="block text-sm font-medium mb-1">
                  Activity * 
                  <span className="text-xs text-gray-600 ml-2">
                    (Hanya activity yang di-assign ke section ini)
                  </span>
                </label>
                <select
                  value={formData.activity_type_id}
                  onChange={(e) => setFormData({...formData, activity_type_id: e.target.value, stage_id: '', alternative_option: ''})}
                  className="w-full px-3 py-2 border rounded"
                  disabled={!formData.section_id}
                >
                  <option value="">Pilih Activity</option>
                  {assignedActivities.map(sa => (
                    <option key={sa.id} value={sa.activity_type_id}>
                      {sa.activity_types.code} - {sa.activity_types.name}
                    </option>
                  ))}
                </select>
                {formData.section_id && assignedActivities.length === 0 && (
                  <p className="text-xs text-orange-600 mt-1">
                    ⚠️ Section ini belum punya activity assignment. Hubungi admin.
                  </p>
                )}
              </div>
              
              {assignedVendor && (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Vendor <span className="text-xs text-blue-600">(Auto-assigned dari Assignment)</span>
                  </label>
                  <div className="w-full px-3 py-2 border rounded bg-blue-50 text-blue-900 font-medium">
                    🔒 {assignedVendor.code} - {assignedVendor.name}
                  </div>
                </div>
              )}
              
              {showStageDropdown && (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Stage / Metode * 
                    {blockSummary.PC.count > 0 && blockSummary.RC.count > 0 && (
                      <span className="text-xs text-orange-600 ml-2">
                        (PC: {blockSummary.PC.count} blok, RC: {blockSummary.RC.count} blok)
                      </span>
                    )}
                  </label>
                  <select
                    value={formData.stage_id}
                    onChange={(e) => setFormData({...formData, stage_id: e.target.value})}
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value="">Pilih Stage</option>
                    {stages.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}
              
              {availableAlternatives.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-1">Alternative Option</label>
                  <select
                    value={formData.alternative_option}
                    onChange={(e) => setFormData({...formData, alternative_option: e.target.value})}
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value="">Default</option>
                    {availableAlternatives.map(alt => (
                      <option key={alt} value={alt}>{alt}</option>
                    ))}
                  </select>
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
              
              {formData.activity_type_id && formData.selectedBlocks.length > 0 && (
                <MaterialPreview
                  activityTypeId={formData.activity_type_id}
                  stageId={formData.stage_id}
                  alternativeOption={formData.alternative_option}
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