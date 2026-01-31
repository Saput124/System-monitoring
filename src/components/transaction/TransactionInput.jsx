import { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabase'

export default function TransactionInput({ user }) {
  const [plans, setPlans] = useState([])
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [blockActivities, setBlockActivities] = useState([])
  const [selectedBlocks, setSelectedBlocks] = useState([])
  const [plannedMaterials, setPlannedMaterials] = useState([]) // CRITICAL: Ambil dari planned_materials!
  const [formData, setFormData] = useState({
    tanggal: new Date().toISOString().split('T')[0],
    jumlah_pekerja: '',
    kondisi: '',
    catatan: ''
  })
  const [loading, setLoading] = useState(false)
  const [materialPreview, setMaterialPreview] = useState([])

  useEffect(() => {
    fetchPlans()
  }, [])

  useEffect(() => {
    if (selectedPlan) {
      fetchBlockActivities()
      fetchPlannedMaterials() // CRITICAL: Ambil stok material!
    }
  }, [selectedPlan])

  useEffect(() => {
    if (selectedBlocks.length > 0 && plannedMaterials.length > 0) {
      calculateMaterialPreview()
    } else {
      setMaterialPreview([])
    }
  }, [selectedBlocks, plannedMaterials])

  const fetchPlans = async () => {
    setLoading(true)
    let query = supabase
      .from('activity_plans')
      .select(`
        *,
        sections(name, code),
        activity_types(name, code, requires_material, requires_vendor),
        vendors(name, code),
        activity_stages(name)
      `)
      .in('status', ['approved', 'in_progress'])
      .order('target_bulan', { ascending: false })

    if (user.role === 'vendor') {
      query = query.eq('vendor_id', user.vendor_id)
    } else if (user.role === 'section_head') {
      query = query.eq('section_id', user.section_id)
    }

    const { data } = await query
    setPlans(data || [])
    setLoading(false)
  }

  const fetchBlockActivities = async () => {
    const { data } = await supabase
      .from('block_activities')
      .select(`
        *,
        blocks(code, name, kawasan, luas_total, kategori, varietas)
      `)
      .eq('activity_plan_id', selectedPlan.id)
      .in('status', ['planned', 'in_progress'])
      .order('created_at')

    setBlockActivities(data || [])
    setSelectedBlocks([])
  }

  // CRITICAL: Ambil planned materials dengan remaining quantity
  const fetchPlannedMaterials = async () => {
    const { data } = await supabase
      .from('planned_materials')
      .select('*, materials(code, name, category, unit)')
      .eq('activity_plan_id', selectedPlan.id)

    setPlannedMaterials(data || [])
    
    console.log('📦 Planned materials loaded:', data?.length || 0)
  }

  // CRITICAL: Preview material yang akan digunakan dan validasi stok
  const calculateMaterialPreview = () => {
    const preview = []
    
    selectedBlocks.forEach(block => {
      const blockData = blockActivities.find(ba => ba.id === block.id)
      if (!blockData) return
      
      // Ambil activity materials yang sesuai
      plannedMaterials.forEach(pm => {
        // Hitung quantity yang dibutuhkan untuk blok ini
        const qtyNeeded = parseFloat(pm.total_quantity) / 
          selectedBlocks.reduce((sum, b) => sum + parseFloat(b.luas_dikerjakan || 0), 0) * 
          parseFloat(block.luas_dikerjakan || 0)
        
        // Cek apakah material ini berlaku untuk kategori blok
        const existingIdx = preview.findIndex(p => p.material_id === pm.material_id)
        
        if (existingIdx >= 0) {
          preview[existingIdx].qty_needed += qtyNeeded
        } else {
          preview.push({
            material_id: pm.material_id,
            material_code: pm.materials.code,
            material_name: pm.materials.name,
            unit: pm.materials.unit,
            qty_needed: qtyNeeded,
            qty_remaining: parseFloat(pm.remaining_quantity),
            sufficient: parseFloat(pm.remaining_quantity) >= qtyNeeded
          })
        }
      })
    })
    
    setMaterialPreview(preview)
  }

  const handleBlockToggle = (ba) => {
    const exists = selectedBlocks.find(b => b.id === ba.id)
    if (exists) {
      setSelectedBlocks(selectedBlocks.filter(b => b.id !== ba.id))
    } else {
      setSelectedBlocks([...selectedBlocks, {
        id: ba.id,
        block_id: ba.block_id,
        code: ba.blocks.code,
        name: ba.blocks.name,
        kawasan: ba.blocks.kawasan,
        kategori: ba.blocks.kategori,
        varietas: ba.blocks.varietas,
        luas_total: ba.luas_total,
        luas_completed: ba.luas_completed || 0,
        luas_remaining: ba.luas_remaining,
        luas_dikerjakan: ba.luas_remaining
      }])
    }
  }

  const handleLuasChange = (blockActivityId, value) => {
    setSelectedBlocks(selectedBlocks.map(b =>
      b.id === blockActivityId ? { ...b, luas_dikerjakan: parseFloat(value) || 0 } : b
    ))
  }

  const getTotalLuasDikerjakan = () => {
    return selectedBlocks.reduce((sum, b) => sum + (parseFloat(b.luas_dikerjakan) || 0), 0)
  }

  const handleSubmit = async () => {
    if (selectedBlocks.length === 0) {
      alert('❌ Pilih minimal 1 blok!')
      return
    }

    if (!formData.tanggal) {
      alert('❌ Tanggal harus diisi!')
      return
    }

    // VALIDASI 1: Luas dikerjakan
    for (const block of selectedBlocks) {
      if (!block.luas_dikerjakan || block.luas_dikerjakan <= 0) {
        alert(`❌ Luas dikerjakan untuk ${block.code} harus > 0`)
        return
      }
      if (block.luas_dikerjakan > block.luas_remaining) {
        alert(`❌ Luas dikerjakan untuk ${block.code} (${block.luas_dikerjakan}) melebihi sisa (${block.luas_remaining})`)
        return
      }
    }

    // VALIDASI 2: Material stock (CRITICAL!)
    if (selectedPlan.activity_types.requires_material && materialPreview.length > 0) {
      const insufficient = materialPreview.filter(m => !m.sufficient)
      
      if (insufficient.length > 0) {
        const details = insufficient.map(m => 
          `- ${m.material_name}: Butuh ${m.qty_needed.toFixed(3)} ${m.unit}, Sisa ${m.qty_remaining.toFixed(3)} ${m.unit}`
        ).join('\n')
        
        alert(`❌ MATERIAL TIDAK CUKUP!\n\n${details}\n\nSilakan kurangi luas dikerjakan atau hubungi admin untuk menambah material.`)
        return
      }
    }

    setLoading(true)

    try {
      // Get material configuration yang sudah ter-filter
      let activityMaterialsConfig = []
      
      if (selectedPlan.activity_types.requires_material) {
        let query = supabase
          .from('activity_materials')
          .select('*, materials(code, name, unit)')
          .eq('activity_type_id', selectedPlan.activity_type_id)

        // CRITICAL: Filter by stage
        if (selectedPlan.stage_id) {
          query = query.or(`stage_id.is.null,stage_id.eq.${selectedPlan.stage_id}`)
        }

        // CRITICAL: Filter by alternative option
        if (selectedPlan.alternative_option) {
          query = query.or(`alternative_option.is.null,alternative_option.eq.${selectedPlan.alternative_option}`)
        }

        const { data } = await query
        activityMaterialsConfig = data || []
      }

      // Insert transactions for each selected block
      for (const block of selectedBlocks) {
        // 1. Insert transaction
        const { data: transaction, error: txError } = await supabase
          .from('transactions')
          .insert({
            block_activity_id: block.id,
            tanggal: formData.tanggal,
            luas_dikerjakan: block.luas_dikerjakan,
            jumlah_pekerja: formData.jumlah_pekerja ? parseInt(formData.jumlah_pekerja) : null,
            kondisi: formData.kondisi || null,
            catatan: formData.catatan || null,
            created_by: user.id
          })
          .select()
          .single()

        if (txError) throw txError

        // 2. Insert materials if required
        if (activityMaterialsConfig.length > 0) {
          const blockData = blockActivities.find(ba => ba.id === block.id)
          
          // Filter materials yang sesuai dengan kategori blok
          const materialInserts = activityMaterialsConfig
            .filter(m => {
              // Filter by tanaman kategori
              if (m.tanaman_kategori && m.tanaman_kategori !== blockData.blocks.kategori) {
                return false
              }
              return true
            })
            .map(m => ({
              transaction_id: transaction.id,
              material_id: m.material_id,
              quantity_used: (parseFloat(m.default_dosis) * parseFloat(block.luas_dikerjakan)).toFixed(3),
              unit: m.unit
            }))

          if (materialInserts.length > 0) {
            const { error: matError } = await supabase
              .from('transaction_materials')
              .insert(materialInserts)
            
            if (matError) throw matError
          }
        }

        // 3. Insert workers (manual count)
        if (formData.jumlah_pekerja) {
          const { error: workerError } = await supabase
            .from('transaction_workers')
            .insert({
              transaction_id: transaction.id,
              worker_id: null,
              jumlah_manual: parseInt(formData.jumlah_pekerja)
            })
          
          if (workerError) throw workerError
        }
      }

      alert(`✅ Transaksi berhasil disimpan untuk ${selectedBlocks.length} blok!`)
      
      // Reset form
      setSelectedPlan(null)
      setBlockActivities([])
      setSelectedBlocks([])
      setPlannedMaterials([])
      setFormData({
        tanggal: new Date().toISOString().split('T')[0],
        jumlah_pekerja: '',
        kondisi: '',
        catatan: ''
      })
      fetchPlans()

    } catch (error) {
      console.error('Error saving transaction:', error)
      alert('❌ Error: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-orange-50 border border-orange-200 rounded p-4">
        <div className="flex items-start gap-2">
          <span className="text-orange-600 text-lg">⚠️</span>
          <div className="text-sm text-orange-800">
            <strong>Perhatian:</strong> Transaksi hanya bisa dilakukan pada rencana kerja yang sudah di-approve. 
            Material akan otomatis dihitung dan divalidasi terhadap stok yang tersedia.
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Pilih Rencana Kerja *</label>
          <select
            value={selectedPlan?.id || ''}
            onChange={(e) => {
              const plan = plans.find(p => p.id === e.target.value)
              setSelectedPlan(plan)
            }}
            className="w-full px-3 py-2 border rounded"
          >
            <option value="">-- Pilih Rencana Kerja --</option>
            {plans.map(plan => (
              <option key={plan.id} value={plan.id}>
                {plan.target_bulan.slice(0, 7)} - {plan.sections.name} - {plan.activity_types.name}
                {plan.vendors && ` - ${plan.vendors.name}`}
              </option>
            ))}
          </select>
        </div>

        {selectedPlan && (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded p-4">
              <h3 className="font-semibold mb-2">Detail Rencana</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-gray-600">Activity:</span> <span className="font-medium">{selectedPlan.activity_types.name}</span></div>
                <div><span className="text-gray-600">Section:</span> <span className="font-medium">{selectedPlan.sections.name}</span></div>
                {selectedPlan.vendors && <div><span className="text-gray-600">Vendor:</span> <span className="font-medium">{selectedPlan.vendors.name}</span></div>}
                {selectedPlan.activity_stages && <div><span className="text-gray-600">Stage:</span> <span className="font-medium">{selectedPlan.activity_stages.name}</span></div>}
                {selectedPlan.alternative_option && <div><span className="text-gray-600">Alternative:</span> <span className="font-medium">{selectedPlan.alternative_option}</span></div>}
              </div>
            </div>

            {/* Material Stock Info */}
            {selectedPlan.activity_types.requires_material && plannedMaterials.length > 0 && (
              <div className="bg-green-50 border border-green-200 rounded p-4">
                <h3 className="font-semibold mb-2">📦 Stok Material Tersedia</h3>
                <div className="space-y-2">
                  {plannedMaterials.map(pm => (
                    <div key={pm.id} className="flex justify-between items-center text-sm">
                      <span className="font-medium">{pm.materials.code} - {pm.materials.name}</span>
                      <span className={`${parseFloat(pm.remaining_quantity) > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        Sisa: {pm.remaining_quantity} {pm.materials.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="block text-sm font-medium">Pilih Blok yang Dikerjakan * ({selectedBlocks.length} dipilih)</label>
                <div className="text-sm text-gray-600">Total: {getTotalLuasDikerjakan().toFixed(2)} Ha</div>
              </div>
              
              {blockActivities.length === 0 ? (
                <div className="text-center py-8 text-gray-500">Semua blok sudah selesai</div>
              ) : (
                <div className="border rounded divide-y max-h-96 overflow-y-auto">
                  {blockActivities.map(ba => {
                    const selected = selectedBlocks.find(b => b.id === ba.id)
                    
                    return (
                      <div key={ba.id} className={`p-4 ${selected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                        <label className="flex items-start gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!selected}
                            onChange={() => handleBlockToggle(ba)}
                            className="w-5 h-5 mt-1"
                          />
                          <div className="flex-1">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <div className="font-medium">{ba.blocks.code} - {ba.blocks.name}</div>
                                <div className="text-sm text-gray-600">
                                  {ba.blocks.kawasan} | {ba.blocks.kategori} | {ba.blocks.varietas}
                                </div>
                              </div>
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                ba.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'
                              }`}>
                                {ba.status}
                              </span>
                            </div>
                            
                            <div className="grid grid-cols-3 gap-2 text-sm mb-2">
                              <div className="bg-white px-2 py-1 rounded">
                                <span className="text-gray-600">Total:</span> <span className="font-medium">{ba.luas_total} Ha</span>
                              </div>
                              <div className="bg-white px-2 py-1 rounded">
                                <span className="text-gray-600">Selesai:</span> <span className="font-medium text-green-600">{(ba.luas_completed || 0).toFixed(2)} Ha</span>
                              </div>
                              <div className="bg-white px-2 py-1 rounded">
                                <span className="text-gray-600">Sisa:</span> <span className="font-medium text-orange-600">{ba.luas_remaining.toFixed(2)} Ha</span>
                              </div>
                            </div>

                            {selected && (
                              <div className="mt-3">
                                <label className="block text-xs font-medium text-gray-700 mb-1">Luas Dikerjakan Hari Ini (Ha) *</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  max={ba.luas_remaining}
                                  value={selected.luas_dikerjakan}
                                  onChange={(e) => handleLuasChange(ba.id, e.target.value)}
                                  className="w-full px-3 py-2 border rounded"
                                  placeholder={`Max: ${ba.luas_remaining} Ha`}
                                />
                              </div>
                            )}
                          </div>
                        </label>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {selectedBlocks.length > 0 && (
              <>
                {/* Material Preview with Stock Validation */}
                {materialPreview.length > 0 && (
                  <div className={`border rounded p-4 ${
                    materialPreview.some(m => !m.sufficient) ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
                  }`}>
                    <h3 className="font-semibold mb-3">
                      {materialPreview.some(m => !m.sufficient) ? '❌ Validasi Material GAGAL' : '✅ Validasi Material OK'}
                    </h3>
                    <div className="space-y-2">
                      {materialPreview.map(m => (
                        <div key={m.material_id} className={`flex justify-between items-center text-sm p-2 rounded ${
                          m.sufficient ? 'bg-white' : 'bg-red-100'
                        }`}>
                          <div>
                            <div className="font-medium">{m.material_code} - {m.material_name}</div>
                            <div className="text-xs text-gray-600">Akan digunakan: {m.qty_needed.toFixed(3)} {m.unit}</div>
                          </div>
                          <div className={`text-right font-medium ${m.sufficient ? 'text-green-600' : 'text-red-600'}`}>
                            {m.sufficient ? '✅' : '❌'} Sisa: {m.qty_remaining.toFixed(3)} {m.unit}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Tanggal Eksekusi *</label>
                    <input 
                      type="date" 
                      value={formData.tanggal} 
                      onChange={(e) => setFormData({...formData, tanggal: e.target.value})} 
                      className="w-full px-3 py-2 border rounded" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Jumlah Pekerja</label>
                    <input 
                      type="number" 
                      value={formData.jumlah_pekerja} 
                      onChange={(e) => setFormData({...formData, jumlah_pekerja: e.target.value})} 
                      className="w-full px-3 py-2 border rounded" 
                      placeholder="Total pekerja"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Kondisi Lapangan</label>
                  <textarea 
                    value={formData.kondisi} 
                    onChange={(e) => setFormData({...formData, kondisi: e.target.value})} 
                    className="w-full px-3 py-2 border rounded" 
                    rows={2}
                    placeholder="Kondisi cuaca, tanah, dll"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Catatan</label>
                  <textarea 
                    value={formData.catatan} 
                    onChange={(e) => setFormData({...formData, catatan: e.target.value})} 
                    className="w-full px-3 py-2 border rounded" 
                    rows={2}
                    placeholder="Catatan tambahan"
                  />
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded p-4">
                  <h3 className="font-semibold mb-2">Summary Transaksi</h3>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Jumlah Blok:</span>
                      <span className="font-medium">{selectedBlocks.length} blok</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total Luas Dikerjakan:</span>
                      <span className="font-medium">{getTotalLuasDikerjakan().toFixed(2)} Ha</span>
                    </div>
                    {selectedPlan.activity_types.requires_material && (
                      <div className="text-xs text-gray-600 mt-2">
                        * Material otomatis terhitung dan divalidasi sesuai stok
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button 
                    onClick={() => {
                      setSelectedBlocks([])
                      setFormData({
                        tanggal: new Date().toISOString().split('T')[0],
                        jumlah_pekerja: '',
                        kondisi: '',
                        catatan: ''
                      })
                    }}
                    className="px-4 py-2 border rounded hover:bg-gray-50"
                  >
                    Reset
                  </button>
                  <button 
                    onClick={handleSubmit}
                    disabled={loading || (materialPreview.length > 0 && materialPreview.some(m => !m.sufficient))}
                    className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Menyimpan...' : '💾 Simpan Transaksi'}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}