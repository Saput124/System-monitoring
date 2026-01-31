// ============================================
// WORKPLANREGISTRATION.JSX - UPDATED VERSION
// Add these changes to your existing file
// ============================================

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../utils/supabase'
import MaterialPreview from './MaterialPreview' // NEW IMPORT

export default function WorkPlanRegistration({ user }) {
  // ... existing state ...
  
  // NEW STATE FOR SMART FORMS
  const [selectedActivity, setSelectedActivity] = useState(null)
  const [availableStages, setAvailableStages] = useState([])
  const [selectedStage, setSelectedStage] = useState(null)
  const [selectedBlocks, setSelectedBlocks] = useState([])
  
  // CALCULATE BLOCK SUMMARY
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
  
  // CHECK FOR MIXED KATEGORI
  const hasMixedKategori = blockSummary.PC.count > 0 && blockSummary.RC.count > 0
  
  // FETCH STAGES WHEN ACTIVITY SELECTED
  useEffect(() => {
    if (selectedActivity) {
      fetchStagesForActivity(selectedActivity)
    } else {
      setAvailableStages([])
      setSelectedStage(null)
    }
  }, [selectedActivity])
  
  const fetchStagesForActivity = async (activityId) => {
    try {
      // Check if activity uses stages
      const { data: activity } = await supabase
        .from('activity_types')
        .select('uses_stages')
        .eq('id', activityId)
        .single()
      
      if (!activity?.uses_stages) {
        setAvailableStages([])
        return
      }
      
      // Fetch stages for this activity
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
  
  // FILTER STAGES BASED ON SELECTED BLOCKS
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
  
  // HANDLE ACTIVITY CHANGE
  const handleActivityChange = (e) => {
    const activityId = e.target.value
    setSelectedActivity(activityId)
    setSelectedStage(null) // Reset stage when activity changes
    setFormData({ ...formData, activity_type_id: activityId, stage_id: '' })
  }
  
  // HANDLE STAGE CHANGE
  const handleStageChange = (e) => {
    const stageId = e.target.value
    setSelectedStage(stageId)
    setFormData({ ...formData, stage_id: stageId })
  }
  
  // HANDLE BLOCK SELECTION
  const handleBlockToggle = (block) => {
    const isSelected = selectedBlocks.some(b => b.id === block.id)
    
    if (isSelected) {
      setSelectedBlocks(selectedBlocks.filter(b => b.id !== block.id))
    } else {
      setSelectedBlocks([...selectedBlocks, block])
    }
  }
  
  // VALIDATE BEFORE SUBMIT
  const handleSubmit = async (e) => {
    e.preventDefault()
    
    // Validation: Check if stage is required but not selected
    if (availableStages.length > 0 && !selectedStage) {
      alert('⚠️ Silakan pilih stage/metode terlebih dahulu')
      return
    }
    
    // Validation: Check if blocks selected
    if (selectedBlocks.length === 0) {
      alert('⚠️ Silakan pilih minimal 1 blok')
      return
    }
    
    // Show confirmation with material preview
    const confirmed = window.confirm(
      `Konfirmasi:\n\n` +
      `Blok: ${selectedBlocks.length} blok\n` +
      `Luas Total: ${(blockSummary.PC.luas + blockSummary.RC.luas).toFixed(2)} Ha\n\n` +
      `Lanjutkan membuat rencana?`
    )
    
    if (!confirmed) return
    
    try {
      setLoading(true)
      
      // 1. Create activity plan
      const { data: plan, error: planError } = await supabase
        .from('activity_plans')
        .insert({
          section_id: formData.section_id,
          activity_type_id: formData.activity_type_id,
          stage_id: selectedStage || null,
          target_bulan: formData.target_bulan,
          status: 'pending',
          created_by: user.id
        })
        .select()
        .single()
      
      if (planError) throw planError
      
      // 2. Create block_activities
      const blockActivities = selectedBlocks.map(block => ({
        activity_plan_id: plan.id,
        block_id: block.id,
        luas_total: block.luas_blok,
        luas_completed: 0,
        luas_remaining: block.luas_blok,
        status: 'planned'
      }))
      
      const { error: baError } = await supabase
        .from('block_activities')
        .insert(blockActivities)
      
      if (baError) throw baError
      
      // 3. Fetch SOP materials and calculate quantities
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
      resetForm()
      fetchPlans()
      
    } catch (err) {
      console.error('Error creating plan:', err)
      alert('❌ Error: ' + err.message)
    } finally {
      setLoading(false)
    }
  }
  
  // FETCH SOP MATERIALS AND CALCULATE
  const fetchSOPMaterials = async (activityTypeId, stageId, blocks) => {
    try {
      // Build query for SOP materials
      let query = supabase
        .from('activity_materials')
        .select(`
          id,
          material_id,
          default_dosis,
          unit,
          required,
          tanaman_kategori,
          material:materials (
            id,
            code,
            name
          )
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
      
      return calculatedMaterials
      
    } catch (err) {
      console.error('Error fetching SOP materials:', err)
      return []
    }
  }
  
  const resetForm = () => {
    setSelectedActivity(null)
    setSelectedStage(null)
    setSelectedBlocks([])
    setFormData({
      section_id: user.section_id || '',
      activity_type_id: '',
      vendor_id: '',
      target_bulan: new Date().toISOString().slice(0, 7) + '-01',
      stage_id: '',
      alternative_option: '',
      selectedBlocks: []
    })
  }
  
  return (
    <div className="container mx-auto px-4 py-8">
      {/* ... existing header ... */}
      
      {/* MODAL FOR NEW PLAN */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-6">Buat Rencana Kerja Baru</h2>
              
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* SECTION SELECTION */}
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
                
                {/* ACTIVITY SELECTION */}
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
                
                {/* STAGE SELECTION (CONDITIONAL) */}
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
                    
                    {/* Warning for mixed kategori */}
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
                
                {/* SUBMIT BUTTONS */}
                <div className="flex justify-end space-x-3 pt-4 border-t">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false)
                      resetForm()
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
      
      {/* ... rest of component ... */}
    </div>
  )
}