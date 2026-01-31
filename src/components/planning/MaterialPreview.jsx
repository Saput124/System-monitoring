import { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabase'

export default function MaterialPreview({ activityTypeId, stageId, alternativeOption, selectedBlocks, blocks }) {
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (activityTypeId && selectedBlocks.length > 0) {
      fetchMaterials()
    }
  }, [activityTypeId, stageId, alternativeOption, selectedBlocks])

  const fetchMaterials = async () => {
    setLoading(true)
    
    // CRITICAL: Query dengan filter yang tepat
    let query = supabase
      .from('activity_materials')
      .select('*, materials(code, name, category, unit)')
      .eq('activity_type_id', activityTypeId)

    // Filter by stage jika ada
    if (stageId) {
      query = query.or(`stage_id.is.null,stage_id.eq.${stageId}`)
    } else {
      query = query.is('stage_id', null)
    }

    // Filter by alternative option jika ada
    if (alternativeOption) {
      query = query.or(`alternative_option.is.null,alternative_option.eq.${alternativeOption}`)
    } else {
      query = query.is('alternative_option', null)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching materials:', error)
      setMaterials([])
      setLoading(false)
      return
    }

    // Hitung total material berdasarkan blok yang dipilih
    const selectedBlocksData = blocks.filter(b => selectedBlocks.includes(b.id))
    
    // Group by kategori
    const luasByKategori = {
      PC: selectedBlocksData.filter(b => b.kategori === 'PC').reduce((sum, b) => sum + parseFloat(b.luas_total), 0),
      RC: selectedBlocksData.filter(b => b.kategori === 'RC').reduce((sum, b) => sum + parseFloat(b.luas_total), 0)
    }

    // Calculate materials
    const calculatedMaterials = (data || []).map(m => {
      let totalQty = 0

      // Hitung berdasarkan kategori tanaman
      if (!m.tanaman_kategori) {
        // Material untuk semua kategori
        totalQty = (luasByKategori.PC + luasByKategori.RC) * parseFloat(m.default_dosis)
      } else if (m.tanaman_kategori === 'PC') {
        totalQty = luasByKategori.PC * parseFloat(m.default_dosis)
      } else if (m.tanaman_kategori === 'RC') {
        totalQty = luasByKategori.RC * parseFloat(m.default_dosis)
      }

      return {
        ...m,
        total_quantity: totalQty.toFixed(3),
        luas_pc: luasByKategori.PC.toFixed(2),
        luas_rc: luasByKategori.RC.toFixed(2)
      }
    })

    setMaterials(calculatedMaterials)
    setLoading(false)

    console.log('📋 Material preview:', {
      activity: activityTypeId,
      stage: stageId,
      alternative: alternativeOption,
      materials: calculatedMaterials.length,
      pc: luasByKategori.PC,
      rc: luasByKategori.RC
    })
  }

  if (loading) {
    return (
      <div className="border rounded p-4">
        <div className="text-center text-gray-600">Loading material preview...</div>
      </div>
    )
  }

  if (materials.length === 0) {
    return (
      <div className="border rounded p-4 bg-yellow-50 border-yellow-200">
        <div className="text-sm text-yellow-800">
          ℹ️ Tidak ada material SOP untuk konfigurasi ini. Activity mungkin tidak memerlukan material.
        </div>
      </div>
    )
  }

  return (
    <div className="border rounded p-4 bg-green-50 border-green-200">
      <h3 className="font-semibold mb-3 text-green-900">📦 Preview Material yang Dibutuhkan</h3>
      
      <div className="mb-3 text-sm text-green-800">
        <div className="flex justify-between">
          <span>Luas PC:</span>
          <span className="font-medium">{materials[0]?.luas_pc || '0.00'} Ha</span>
        </div>
        <div className="flex justify-between">
          <span>Luas RC:</span>
          <span className="font-medium">{materials[0]?.luas_rc || '0.00'} Ha</span>
        </div>
      </div>

      <div className="space-y-2">
        {materials.map((m, idx) => (
          <div key={idx} className="bg-white rounded p-3 border border-green-200">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="font-medium">{m.materials.code} - {m.materials.name}</div>
                <div className="text-xs text-gray-600 flex items-center gap-2 mt-1">
                  <span className="px-2 py-0.5 bg-gray-100 rounded">{m.materials.category}</span>
                  {m.tanaman_kategori && (
                    <span className={`px-2 py-0.5 rounded ${
                      m.tanaman_kategori === 'PC' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                    }`}>
                      {m.tanaman_kategori} only
                    </span>
                  )}
                  {m.alternative_option && (
                    <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded">
                      {m.alternative_option}
                    </span>
                  )}
                  {m.required && (
                    <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded">
                      Wajib
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  Dosis: {m.default_dosis} {m.unit}/Ha
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-green-600">{m.total_quantity}</div>
                <div className="text-xs text-gray-600">{m.unit}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 text-xs text-green-800 bg-green-100 rounded p-2">
        💡 <strong>Catatan:</strong> Quantity akan otomatis dihitung saat membuat transaksi berdasarkan luas aktual yang dikerjakan.
      </div>
    </div>
  )
}