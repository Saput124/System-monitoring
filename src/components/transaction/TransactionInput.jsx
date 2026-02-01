import { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabase'

export default function TransactionInput({ user, onTransactionSuccess }) {
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
  const [submitting, setSubmitting] = useState(false)

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
      const baCompleted = parseFloat(ba.luas_completed || 0)
      const baTotal = parseFloat(ba.luas_total || 0)
      const derivedRemaining = Math.max(0, baTotal - baCompleted)

      setSelectedBlocks([...selectedBlocks, {
        id: ba.id,
        block_id: ba.block_id,
        code: ba.blocks.code,
        name: ba.blocks.name,
        kawasan: ba.blocks.kawasan,
        kategori: ba.blocks.kategori,
        varietas: ba.blocks.varietas,
        luas_total: ba.luas_total,
        luas_completed: baCompleted,
        luas_remaining: derivedRemaining,
        luas_dikerjakan: ''
      }])
    }
  }

  const handleLuasChange = (blockActivityId, value) => {
    setSelectedBlocks(selectedBlocks.map(b =>
      b.id === blockActivityId ? { ...b, luas_dikerjakan: value } : b
    ))
  }

  const getTotalLuasDikerjakan = () => {
    return selectedBlocks.reduce((sum, b) => sum + (parseFloat(b.luas_dikerjakan) || 0), 0)
  }

  const handleSubmit = async () => {
    // 🔥 CRITICAL: Prevent double submission
    if (submitting) {
      console.log('Already submitting, please wait...')
      return
    }

    if (selectedBlocks.length === 0) {
      alert('❌ Pilih minimal 1 blok!')
      return
    }

    if (!formData.tanggal) {
      alert('❌ Tanggal harus diisi!')
      return
    }

    setSubmitting(true)
    setLoading(true)

    try {
      // 🔥 STEP 1: Validate dengan FRESH data
      const { data: freshBlocks, error: fetchError } = await supabase
        .from('block_activities')
        .select('*')
        .in('id', selectedBlocks.map(b => b.id))

      if (fetchError) {
        throw new Error(`Gagal mengambil data: ${fetchError.message}`)
      }

      // Validate setiap blok
      const validationErrors = []
      
      for (const block of selectedBlocks) {
        const parsed = parseFloat(block.luas_dikerjakan)
        
        if (isNaN(parsed) || parsed <= 0) {
          validationErrors.push(`Luas dikerjakan untuk ${block.code} harus > 0`)
          continue
        }
        
        const freshBlock = freshBlocks?.find(fb => fb.id === block.id)
        if (!freshBlock) {
          validationErrors.push(`Data blok ${block.code} tidak ditemukan!`)
          continue
        }
        
        const currentRemaining = parseFloat(freshBlock.luas_remaining)
        
        if (parsed > currentRemaining) {
          validationErrors.push(
            `Luas dikerjakan untuk ${block.code} (${parsed.toFixed(2)} Ha) ` +
            `melebihi sisa yang tersedia (${currentRemaining.toFixed(2)} Ha)`
          )
        }
      }

      // 🔥 CRITICAL: Jika ada error validasi, STOP dan refresh UI
      if (validationErrors.length > 0) {
        alert('❌ VALIDASI GAGAL:\n\n' + validationErrors.join('\n') + '\n\nData UI akan di-refresh.')
        await fetchBlockActivities()
        setSubmitting(false)
        setLoading(false)
        return // STOP EXECUTION
      }

      // 🔥 STEP 2: Insert transaction (dalam try-catch terpisah)
      let transaction
      try {
        const { data: txData, error: txError } = await supabase
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
        transaction = txData
        
      } catch (txError) {
        throw new Error(`Gagal membuat transaksi: ${txError.message}`)
      }

      // 🔥 STEP 3: Insert transaction_blocks
      try {
        const blockInserts = selectedBlocks.map(block => ({
          transaction_id: transaction.id,
          block_id: block.block_id,
          luas_dikerjakan: parseFloat(block.luas_dikerjakan)
        }))

        const { error: blockError } = await supabase
          .from('transaction_blocks')
          .insert(blockInserts)

        if (blockError) throw blockError
        
      } catch (blockError) {
        // Rollback: delete transaction
        await supabase.from('transactions').delete().eq('id', transaction.id)
        throw new Error(`Gagal menyimpan block data: ${blockError.message}`)
      }

      // 🔥 STEP 4: Insert transaction_materials (dengan validasi null)
      if (selectedPlan.activities?.requires_material) {
        try {
          let matQuery = supabase
            .from('activity_materials')
            .select('*, materials(code, name, unit), activity_stages(kategori)')
            .eq('activity_id', selectedPlan.activity_id)

          if (selectedPlan.stage_id) {
            matQuery = matQuery.eq('stage_id', selectedPlan.stage_id)
          }

          const { data: sopMaterials } = await matQuery

          if (sopMaterials && sopMaterials.length > 0) {
            const materialTotals = {}

            selectedBlocks.forEach(block => {
              const blockData = blockActivities.find(ba => ba.id === block.id)
              const luasDikerjakan = parseFloat(block.luas_dikerjakan)

              sopMaterials.forEach(sop => {
                const materialId = sop.material_id
                const dosis = parseFloat(sop.default_dosis)

                // 🔥 CRITICAL: Validate dosis tidak null/0
                if (!dosis || isNaN(dosis)) {
                  console.warn(`Dosis untuk material ${sop.materials?.code} adalah 0 atau null, skip`)
                  return
                }

                // Filter by stage kategori - skip if block doesn't match stage kategori
                const stageKategori = sop.activity_stages?.kategori
                if (stageKategori && stageKategori !== 'ALL' && stageKategori !== blockData.blocks.kategori) {
                  console.log(`Skip material ${sop.materials?.code} for block ${blockData.blocks.code}: stage kategori ${stageKategori} != block kategori ${blockData.blocks.kategori}`)
                  return
                }

                const qty = dosis * luasDikerjakan

                if (!materialTotals[materialId]) {
                  materialTotals[materialId] = {
                    material_id: materialId,
                    unit: sop.materials.unit,
                    quantity: 0
                  }
                }
                materialTotals[materialId].quantity += qty
              })
            })

            const materialInserts = Object.values(materialTotals)
              .filter(mat => mat.quantity > 0) // 🔥 Filter out zero quantities
              .map(mat => ({
                transaction_id: transaction.id,
                material_id: mat.material_id,
                quantity_used: parseFloat(mat.quantity.toFixed(3)), // 🔥 Ensure not null
                unit: mat.unit
              }))

            if (materialInserts.length > 0) {
              const { error: matError } = await supabase
                .from('transaction_materials')
                .insert(materialInserts)

              if (matError) {
                // Rollback: delete transaction_blocks dan transaction
                await supabase.from('transaction_blocks').delete().eq('transaction_id', transaction.id)
                await supabase.from('transactions').delete().eq('id', transaction.id)
                throw matError
              }
            }
          }
          
        } catch (matError) {
          // Rollback sudah dilakukan di catch block di atas
          throw new Error(`Gagal menyimpan material: ${matError.message}`)
        }
      }

      // 🔥 STEP 5: Recalculate block_activities dari ground truth (transaction_blocks)
      // PENTING: Tidak boleh additive (current + dikerjakan) karena bisa ada trigger
      // Supabase yang sudah mengupdate. Hitung dari scratch berdasarkan semua 
      // transaction_blocks yang ada untuk block_activity ini.
      try {
        // Ambil semua unique block_activity IDs yang terlibat
        const blockActivityIds = selectedBlocks.map(b => b.id)

        for (const baId of blockActivityIds) {
          // Fetch fresh block_activity untuk dapat luas_total
          const { data: freshBA } = await supabase
            .from('block_activities')
            .select('*')
            .eq('id', baId)
            .single()

          if (!freshBA) continue

          // Hitung total luas_completed dari SEMUA transaction_blocks 
          // yang terkait block_activity ini (ground truth)
          const { data: allTxBlocks } = await supabase
            .from('transaction_blocks')
            .select('luas_dikerjakan')
            .eq('block_id', freshBA.block_id)

          const trueLuasCompleted = (allTxBlocks || []).reduce(
            (sum, tb) => sum + parseFloat(tb.luas_dikerjakan || 0), 0
          )

          const baTotal = parseFloat(freshBA.luas_total || 0)
          const newRemaining = Math.max(0, parseFloat((baTotal - trueLuasCompleted).toFixed(4)))
          const newStatus = newRemaining <= 0 ? 'completed' : trueLuasCompleted > 0 ? 'in_progress' : 'planned'

          const { error: updateError } = await supabase
            .from('block_activities')
            .update({
              luas_completed: parseFloat(trueLuasCompleted.toFixed(4)),
              luas_remaining: newRemaining,
              status: newStatus,
              updated_at: new Date().toISOString()
            })
            .eq('id', baId)

          if (updateError) {
            console.error(`Failed to update block_activity ${baId}:`, updateError)
            throw updateError
          }
        }

        // 🔥 STEP 6: Sync status activity_plan berdasarkan semua block_activities
        const { data: allBA } = await supabase
          .from('block_activities')
          .select('status')
          .eq('activity_plan_id', selectedPlan.id)

        if (allBA && allBA.length > 0) {
          const allCompleted = allBA.every(ba => ba.status === 'completed')
          const anyInProgress = allBA.some(ba => ba.status === 'in_progress')
          const newPlanStatus = allCompleted ? 'completed' : anyInProgress ? 'in_progress' : 'approved'

          await supabase
            .from('activity_plans')
            .update({ status: newPlanStatus, updated_at: new Date().toISOString() })
            .eq('id', selectedPlan.id)
        }

      } catch (updateError) {
        // Rollback: hapus transaction_materials, transaction_blocks, transaction
        await supabase.from('transaction_materials').delete().eq('transaction_id', transaction.id)
        await supabase.from('transaction_blocks').delete().eq('transaction_id', transaction.id)
        await supabase.from('transactions').delete().eq('id', transaction.id)
        throw new Error(`Gagal mengupdate status blok: ${updateError.message}`)
      }

      // 🔥 SUCCESS!
      alert('✅ Transaksi berhasil disimpan!')
      
      // Reset form
      setSelectedBlocks([])
      setFormData({
        tanggal: new Date().toISOString().split('T')[0],
        jumlah_pekerja: '',
        catatan: ''
      })
      
      // Refresh block activities
      await fetchBlockActivities()
      
      // Trigger callback untuk refresh history
      if (onTransactionSuccess) {
        onTransactionSuccess()
      }

    } catch (error) {
      console.error('Error saving transaction:', error)
      alert(`❌ Gagal menyimpan transaksi:\n\n${error.message}\n\nTransaksi telah dibatalkan (rollback).`)
      
      // Refresh UI untuk tampilkan data terbaru
      await fetchBlockActivities()
      
    } finally {
      setSubmitting(false)
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">Pilih Rencana Kerja *</label>
            <select
              value={selectedPlan?.id || ''}
              onChange={(e) => {
                const plan = plans.find(p => p.id === e.target.value)
                setSelectedPlan(plan)
                setSelectedBlocks([])
              }}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
              disabled={submitting}
            >
              <option value="">-- Pilih Rencana --</option>
              {plans.map(p => (
                <option key={p.id} value={p.id}>
                  {p.activities?.name} - {p.sections?.name} 
                  {p.activity_stages && ` - ${p.activity_stages.name}`}
                  {p.vendors && ` - ${p.vendors.name}`}
                  {' '}({new Date(p.target_date).toLocaleDateString('id-ID')})
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
                  <div className="text-center py-8 text-gray-500 bg-gray-50 rounded border-2 border-dashed">
                    🎉 Semua blok sudah selesai dikerjakan!
                  </div>
                ) : (
                  <div className="border rounded divide-y max-h-96 overflow-y-auto">
                    {blockActivities.map(ba => {
                      const selected = selectedBlocks.find(b => b.id === ba.id)
                      const baCompleted = parseFloat(ba.luas_completed || 0)
                      const baTotal = parseFloat(ba.luas_total || 0)
                      const baSisa = Math.max(0, baTotal - baCompleted)

                      return (
                        <div key={ba.id} className={`p-4 ${selected ? 'bg-blue-50 border-l-4 border-blue-500' : 'hover:bg-gray-50'}`}>
                          <label className="flex items-start gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!selected}
                              onChange={() => handleBlockToggle(ba)}
                              disabled={submitting}
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
                                <div className="bg-white px-2 py-1 rounded border">
                                  <span className="text-gray-600">Total:</span> <span className="font-medium">{baTotal.toFixed(2)} Ha</span>
                                </div>
                                <div className="bg-white px-2 py-1 rounded border">
                                  <span className="text-gray-600">Selesai:</span> <span className="font-medium text-green-600">{baCompleted.toFixed(2)} Ha</span>
                                </div>
                                <div className="bg-white px-2 py-1 rounded border">
                                  <span className="text-gray-600">Sisa:</span> <span className="font-medium text-orange-600">{baSisa.toFixed(2)} Ha</span>
                                </div>
                              </div>

                              {selected && (
                                <div className="mt-3 bg-white p-3 rounded border-2 border-blue-200">
                                  <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Luas Dikerjakan Hari Ini (Ha) *
                                  </label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max={baSisa}
                                    value={selected.luas_dikerjakan}
                                    onChange={(e) => handleLuasChange(ba.id, e.target.value)}
                                    onFocus={(e) => e.target.select()}
                                    disabled={submitting}
                                    className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                                    placeholder={`Maksimal ${baSisa.toFixed(2)} Ha`}
                                  />
                                  <div className="text-xs text-orange-600 mt-1 font-medium">
                                    ⚠️ Sisa yang tersedia: {baSisa.toFixed(2)} Ha
                                  </div>
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
                        disabled={submitting}
                        className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100" 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Jumlah Pekerja</label>
                      <input 
                        type="number" 
                        min="0"
                        value={formData.jumlah_pekerja} 
                        onChange={(e) => setFormData({...formData, jumlah_pekerja: e.target.value})} 
                        disabled={submitting}
                        className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100" 
                        placeholder="Total pekerja"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Catatan</label>
                    <textarea 
                      value={formData.catatan} 
                      onChange={(e) => setFormData({...formData, catatan: e.target.value})} 
                      disabled={submitting}
                      className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100" 
                      rows={3}
                      placeholder="Kondisi lapangan, catatan tambahan, dll"
                    />
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded p-4">
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <span>📊</span> Summary Transaksi
                    </h3>
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
                        <div className="text-xs text-gray-600 mt-2 bg-blue-50 p-2 rounded">
                          ℹ️ Material akan otomatis terhitung sesuai SOP
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <button 
                      onClick={() => {
                        if (submitting) return
                        setSelectedBlocks([])
                        setFormData({
                          tanggal: new Date().toISOString().split('T')[0],
                          jumlah_pekerja: '',
                          catatan: ''
                        })
                      }}
                      disabled={submitting}
                      className="px-4 py-2 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      🔄 Reset
                    </button>
                    <button 
                      onClick={handleSubmit}
                      disabled={submitting}
                      className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {submitting ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          <span>Menyimpan...</span>
                        </>
                      ) : (
                        <>
                          <span>💾</span>
                          <span>Simpan Transaksi</span>
                        </>
                      )}
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
