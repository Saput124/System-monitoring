import { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabase'

export default function TransactionInput({ user }) {
  const [plans, setPlans] = useState([])
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [blockActivities, setBlockActivities] = useState([])
  const [selectedBlocks, setSelectedBlocks] = useState([])
  const [formData, setFormData] = useState({
    tanggal: new Date().toISOString().split('T')[0],
    jumlah_pekerja: '',
    catatan: ''
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchPlans()
  }, [])

  useEffect(() => {
    if (selectedPlan) {
      fetchBlockActivities()
    }
  }, [selectedPlan])

  const fetchPlans = async () => {
    setLoading(true)
    let query = supabase
      .from('activity_plans')
      .select(`
        *,
        sections(name),
        activities(name, requires_material, requires_vendor),
        vendors(name),
        activity_stages(name)
      `)
      .in('status', ['approved', 'in_progress'])
      .order('target_date', { ascending: false })

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

    // Validate luas dikerjakan
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

    setLoading(true)

    try {
      // 1. Insert 1 transaction untuk plan ini
      const { data: transaction, error: txError } = await supabase
        .from('transactions')
        .insert({
          activity_plan_id: selectedPlan.id,
          transaction_date: formData.tanggal,
          jumlah_pekerja: formData.jumlah_pekerja ? parseInt(formData.jumlah_pekerja) : null,
          catatan: formData.catatan || null,
          created_by: user.id
        })
        .select()
        .single()

      if (txError) throw txError

      // 2. Insert transaction_blocks per blok yang dipilih
      // -> trigger update_block_progress otomatis update block_activities
      const blockInserts = selectedBlocks.map(block => ({
        transaction_id: transaction.id,
        block_id: block.block_id,
        luas_dikerjakan: parseFloat(block.luas_dikerjakan)
      }))

      const { error: blockError } = await supabase
        .from('transaction_blocks')
        .insert(blockInserts)

      if (blockError) throw blockError

      // 3. Insert transaction_materials kalau activity requires material
      // -> trigger update_material_allocation otomatis update planned_materials
      if (selectedPlan.activities?.requires_material) {
        let matQuery = supabase
          .from('activity_materials')
          .select('*, materials(code, name, unit)')
          .eq('activity_id', selectedPlan.activity_id)

        if (selectedPlan.stage_id) {
          matQuery = matQuery.eq('stage_id', selectedPlan.stage_id)
        }

        const { data: sopMaterials } = await matQuery

        if (sopMaterials && sopMaterials.length > 0) {
          // Aggregate material per blok (dosis * luas), group by material_id
          const materialTotals = {}

          selectedBlocks.forEach(block => {
            const blockData = blockActivities.find(ba => ba.id === block.id)
            const blockKategori = blockData?.blocks?.kategori

            sopMaterials.forEach(sop => {
              // Filter material berdasarkan kategori blok
              if (sop.kategori && sop.kategori !== 'ALL' && sop.kategori !== blockKategori) return

              const key = sop.material_id
              if (!materialTotals[key]) {
                materialTotals[key] = {
                  material_id: sop.material_id,
                  quantity_used: 0,
                  unit: sop.unit || sop.materials?.unit
                }
              }
              materialTotals[key].quantity_used += parseFloat(sop.default_dosis) * parseFloat(block.luas_dikerjakan)
            })
          })

          const materialInserts = Object.values(materialTotals).map(m => ({
            transaction_id: transaction.id,
            material_id: m.material_id,
            quantity_used: parseFloat(m.quantity_used.toFixed(3)),
            unit: m.unit
          }))

          if (materialInserts.length > 0) {
            const { error: matError } = await supabase
              .from('transaction_materials')
              .insert(materialInserts)

            if (matError) throw matError
          }
        }
      }

      alert(`✅ Transaksi berhasil disimpan untuk ${selectedBlocks.length} blok!`)
      
      // Reset form
      setSelectedBlocks([])
      setFormData({
        tanggal: new Date().toISOString().split('T')[0],
        jumlah_pekerja: '',
        catatan: ''
      })
      
      // Refresh data
      fetchBlockActivities()
      fetchPlans()

    } catch (error) {
      alert('❌ Error: ' + error.message)
    }

    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Input Transaksi</h1>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Pilih Rencana Kerja *</label>
            <select 
              value={selectedPlan?.id || ''} 
              onChange={(e) => {
                const plan = plans.find(p => p.id === e.target.value)
                setSelectedPlan(plan)
              }}
              className="w-full px-3 py-2 border rounded"
            >
              <option value="">-- Pilih Rencana --</option>
              {plans.map(plan => (
                <option key={plan.id} value={plan.id}>
                  {plan.activities?.name} - {plan.sections?.name} - {new Date(plan.target_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                  {plan.activity_stages ? ` [${plan.activity_stages.name}]` : ''}
                  {plan.vendors ? ` - ${plan.vendors.name}` : ''}
                </option>
              ))}
            </select>
          </div>

          {selectedPlan && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded p-4">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-semibold">Detail Rencana</h3>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    selectedPlan.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'
                  }`}>
                    {selectedPlan.status === 'in_progress' ? 'Sedang Dikerjakan' : 'Approved'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-gray-600">Activity:</span> <span className="font-medium">{selectedPlan.activities?.name}</span></div>
                  <div><span className="text-gray-600">Section:</span> <span className="font-medium">{selectedPlan.sections?.name}</span></div>
                  <div><span className="text-gray-600">Target Tanggal:</span> <span className="font-medium">{new Date(selectedPlan.target_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
                  {selectedPlan.activity_stages && <div><span className="text-gray-600">Stage:</span> <span className="font-medium">{selectedPlan.activity_stages.name}</span></div>}
                  {selectedPlan.vendors && <div><span className="text-gray-600">Vendor:</span> <span className="font-medium">{selectedPlan.vendors.name}</span></div>}
                </div>
              </div>

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
                    <label className="block text-sm font-medium mb-1">Catatan</label>
                    <textarea 
                      value={formData.catatan} 
                      onChange={(e) => setFormData({...formData, catatan: e.target.value})} 
                      className="w-full px-3 py-2 border rounded" 
                      rows={3}
                      placeholder="Kondisi lapangan, catatan tambahan, dll"
                    />
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded p-4">
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
                      {selectedPlan.activities?.requires_material && (
                        <div className="text-xs text-gray-600 mt-2">
                          * Material akan otomatis terhitung sesuai SOP
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
                          catatan: ''
                        })
                      }}
                      className="px-4 py-2 border rounded hover:bg-gray-50"
                    >
                      Reset
                    </button>
                    <button 
                      onClick={handleSubmit}
                      disabled={loading}
                      className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
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
    </div>
  )
}
