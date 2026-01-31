import { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabase'

export default function TransactionInput({ user }) {
  const [plans, setPlans] = useState([])
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [blockActivities, setBlockActivities] = useState([])
  const [selectedBlocks, setSelectedBlocks] = useState([])
  const [plannedMaterials, setPlannedMaterials] = useState([])
  const [formData, setFormData] = useState({
    tanggal_pekerjaan: new Date().toISOString().split('T')[0],
    worker_name: '',
    pekerja: '',
    notes: ''
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchPlans()
  }, [])

  useEffect(() => {
    if (selectedPlan) {
      fetchBlockActivities()
      fetchPlannedMaterials()
    }
  }, [selectedPlan])

  const fetchPlans = async () => {
    setLoading(true)
    let query = supabase
      .from('activity_plans')
      .select(`
        *,
        sections(name),
        activity_types(name, uses_stages),
        vendors(name),
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
        blocks(
          id,
          kode_blok,
          nama_blok,
          kawasan,
          luas_blok,
          tanaman_kategori,
          varietas
        )
      `)
      .eq('activity_plan_id', selectedPlan.id)
      .in('status', ['planned', 'in_progress'])
      .order('created_at')

    setBlockActivities(data || [])
    setSelectedBlocks([])
  }

  const fetchPlannedMaterials = async () => {
    const { data } = await supabase
      .from('planned_materials')
      .select(`
        *,
        materials(id, code, name, unit)
      `)
      .eq('activity_plan_id', selectedPlan.id)

    setPlannedMaterials(data || [])
  }

  const handleBlockToggle = (ba) => {
    const exists = selectedBlocks.find(b => b.id === ba.id)
    if (exists) {
      setSelectedBlocks(selectedBlocks.filter(b => b.id !== ba.id))
    } else {
      setSelectedBlocks([...selectedBlocks, {
        id: ba.id,
        block_id: ba.block_id,
        kode_blok: ba.blocks.kode_blok,
        nama_blok: ba.blocks.nama_blok,
        kawasan: ba.blocks.kawasan,
        tanaman_kategori: ba.blocks.tanaman_kategori,
        varietas: ba.blocks.varietas,
        luas_total: ba.luas_total,
        luas_completed: ba.luas_completed || 0,
        luas_remaining: ba.luas_remaining,
        luas_dikerjakan: Math.min(ba.luas_remaining, ba.luas_total)
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

  const calculateMaterialsForBlock = (block) => {
    // Fetch SOP materials based on activity and stage
    return new Promise(async (resolve) => {
      try {
        let query = supabase
          .from('activity_materials')
          .select('*, materials(id, code, name, unit)')
          .eq('activity_type_id', selectedPlan.activity_type_id)

        // Filter by stage if exists
        if (selectedPlan.stage_id) {
          query = query.eq('stage_id', selectedPlan.stage_id)
        } else {
          query = query.is('stage_id', null)
        }

        const { data: activityMaterials } = await query

        if (!activityMaterials) {
          resolve([])
          return
        }

        // Filter by kategori and calculate
        const materials = activityMaterials
          .filter(am => {
            // Filter by tanaman_kategori
            if (am.tanaman_kategori && am.tanaman_kategori !== block.tanaman_kategori) {
              return false
            }
            return true
          })
          .map(am => ({
            material_id: am.material_id,
            material_code: am.materials.code,
            material_name: am.materials.name,
            quantity_used: (parseFloat(am.default_dosis) * parseFloat(block.luas_dikerjakan)).toFixed(3),
            unit: am.unit
          }))

        resolve(materials)
      } catch (err) {
        console.error('Error calculating materials:', err)
        resolve([])
      }
    })
  }

  const handleSubmit = async () => {
    if (selectedBlocks.length === 0) {
      alert('❌ Pilih minimal 1 blok!')
      return
    }

    if (!formData.tanggal_pekerjaan) {
      alert('❌ Tanggal harus diisi!')
      return
    }

    // Validate luas dikerjakan
    for (const block of selectedBlocks) {
      if (!block.luas_dikerjakan || block.luas_dikerjakan <= 0) {
        alert(`❌ Luas dikerjakan untuk ${block.kode_blok} harus > 0`)
        return
      }
      if (block.luas_dikerjakan > block.luas_remaining) {
        alert(`❌ Luas dikerjakan untuk ${block.kode_blok} (${block.luas_dikerjakan}) melebihi sisa (${block.luas_remaining})`)
        return
      }
    }

    const confirmed = confirm(
      `Konfirmasi Transaksi:\n\n` +
      `Tanggal: ${formData.tanggal_pekerjaan}\n` +
      `Jumlah Blok: ${selectedBlocks.length}\n` +
      `Total Luas: ${getTotalLuasDikerjakan().toFixed(2)} Ha\n\n` +
      `Lanjutkan?`
    )

    if (!confirmed) return

    setLoading(true)

    try {
      // Insert transactions for each selected block
      for (const block of selectedBlocks) {
        // 1. Insert transaction
        const { data: transaction, error: txError } = await supabase
          .from('transactions')
          .insert({
            block_activity_id: block.id,
            tanggal_pekerjaan: formData.tanggal_pekerjaan,
            luas_dikerjakan: block.luas_dikerjakan,
            worker_name: formData.worker_name || null,
            pekerja: formData.pekerja ? parseInt(formData.pekerja) : null,
            notes: formData.notes || null,
            created_by: user.id
          })
          .select()
          .single()

        if (txError) throw txError

        // 2. Calculate and insert materials based on SOP
        const materials = await calculateMaterialsForBlock(block)
        
        if (materials.length > 0) {
          const materialInserts = materials.map(m => ({
            transaction_id: transaction.id,
            material_id: m.material_id,
            quantity_used: m.quantity_used,
            unit: m.unit
          }))

          const { error: matError } = await supabase
            .from('transaction_materials')
            .insert(materialInserts)

          if (matError) throw matError
        }
      }

      alert(`✅ Transaksi berhasil disimpan untuk ${selectedBlocks.length} blok!`)
      
      // Reset form
      setSelectedBlocks([])
      setFormData({
        tanggal_pekerjaan: new Date().toISOString().split('T')[0],
        worker_name: '',
        pekerja: '',
        notes: ''
      })
      
      // Refresh data
      fetchPlans()
      if (selectedPlan) {
        fetchBlockActivities()
        fetchPlannedMaterials()
      }

    } catch (err) {
      console.error('Error saving transaction:', err)
      alert('❌ Error: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Plan Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Pilih Rencana Kerja
        </label>
        <select
          value={selectedPlan?.id || ''}
          onChange={(e) => {
            const plan = plans.find(p => p.id === e.target.value)
            setSelectedPlan(plan || null)
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        >
          <option value="">-- Pilih Rencana --</option>
          {plans.map(plan => (
            <option key={plan.id} value={plan.id}>
              {plan.activity_types?.name} - {plan.sections?.name} 
              {plan.activity_stages && ` (${plan.activity_stages.name})`}
              {' - '}{new Date(plan.target_bulan).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
            </option>
          ))}
        </select>
      </div>

      {selectedPlan && (
        <>
          {/* Plan Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">Detail Rencana</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-blue-700">Activity:</span>
                <span className="ml-2 font-medium">{selectedPlan.activity_types?.name}</span>
              </div>
              {selectedPlan.activity_stages && (
                <div>
                  <span className="text-blue-700">Stage:</span>
                  <span className="ml-2 font-medium">{selectedPlan.activity_stages.name}</span>
                </div>
              )}
              <div>
                <span className="text-blue-700">Section:</span>
                <span className="ml-2 font-medium">{selectedPlan.sections?.name}</span>
              </div>
              <div>
                <span className="text-blue-700">Target:</span>
                <span className="ml-2 font-medium">
                  {new Date(selectedPlan.target_bulan).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
                </span>
              </div>
            </div>
          </div>

          {/* Material Summary */}
          {plannedMaterials.length > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Material Planned:</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {plannedMaterials.map(pm => (
                  <div key={pm.id} className="text-sm">
                    <div className="font-medium">{pm.materials.name}</div>
                    <div className="text-gray-600">
                      {pm.total_quantity.toFixed(2)} {pm.unit}
                      <span className="text-xs ml-1">
                        (Sisa: {pm.remaining_quantity.toFixed(2)})
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Block Selection */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Pilih Blok yang Dikerjakan:</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-3">
              {blockActivities.length === 0 ? (
                <div className="text-center text-gray-500 py-4">
                  Semua blok sudah selesai atau tidak ada blok
                </div>
              ) : (
                blockActivities.map(ba => (
                  <label
                    key={ba.id}
                    className={`flex items-center space-x-3 p-3 rounded cursor-pointer ${
                      selectedBlocks.some(b => b.id === ba.id)
                        ? 'bg-green-100 border-green-500 border-2'
                        : 'bg-gray-50 border border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedBlocks.some(b => b.id === ba.id)}
                      onChange={() => handleBlockToggle(ba)}
                      className="rounded text-green-600"
                    />
                    <div className="flex-1">
                      <div className="font-medium">
                        {ba.blocks.kode_blok}
                        {ba.blocks.tanaman_kategori && (
                          <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
                            ba.blocks.tanaman_kategori === 'PC' 
                              ? 'bg-green-100 text-green-700' 
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {ba.blocks.tanaman_kategori}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-600">
                        {ba.blocks.nama_blok} • {ba.blocks.kawasan}
                        {ba.blocks.varietas && ` • ${ba.blocks.varietas}`}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Total: {ba.luas_total} Ha • 
                        Selesai: {(ba.luas_completed || 0).toFixed(2)} Ha • 
                        Sisa: {ba.luas_remaining.toFixed(2)} Ha
                      </div>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Selected Blocks Detail */}
          {selectedBlocks.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Detail Pekerjaan:</h3>
              <div className="space-y-3">
                {selectedBlocks.map(block => (
                  <div key={block.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="font-medium">{block.kode_blok}</div>
                        <div className="text-sm text-gray-600">
                          Sisa: {block.luas_remaining.toFixed(2)} Ha
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedBlocks(selectedBlocks.filter(b => b.id !== block.id))}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        ✕ Hapus
                      </button>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Luas Dikerjakan (Ha) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={block.luas_remaining}
                        value={block.luas_dikerjakan}
                        onChange={(e) => handleLuasChange(block.id, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      />
                    </div>
                  </div>
                ))}

                {/* Summary */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="font-semibold text-green-900">
                    Total Luas Dikerjakan: {getTotalLuasDikerjakan().toFixed(2)} Ha
                  </div>
                  <div className="text-sm text-green-700">
                    {selectedBlocks.length} blok dipilih
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Transaction Form */}
          {selectedBlocks.length > 0 && (
            <div className="border-t pt-6">
              <h3 className="font-semibold text-gray-900 mb-4">Informasi Transaksi:</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tanggal Pekerjaan *
                  </label>
                  <input
                    type="date"
                    value={formData.tanggal_pekerjaan}
                    onChange={(e) => setFormData({ ...formData, tanggal_pekerjaan: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nama Pekerja/Kontraktor
                  </label>
                  <input
                    type="text"
                    value={formData.worker_name}
                    onChange={(e) => setFormData({ ...formData, worker_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="Nama pekerja atau vendor"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Jumlah Pekerja
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.pekerja}
                    onChange={(e) => setFormData({ ...formData, pekerja: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Catatan
                  </label>
                  <input
                    type="text"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="Kondisi atau catatan lainnya"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setSelectedBlocks([])
                    setFormData({
                      tanggal_pekerjaan: new Date().toISOString().split('T')[0],
                      worker_name: '',
                      pekerja: '',
                      notes: ''
                    })
                  }}
                  className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Reset
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400"
                >
                  {loading ? 'Menyimpan...' : '✓ Simpan Transaksi'}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {!selectedPlan && (
        <div className="text-center py-12 text-gray-500">
          <div className="text-4xl mb-4">📋</div>
          <div>Pilih rencana kerja untuk memulai transaksi</div>
        </div>
      )}
    </div>
  )
}