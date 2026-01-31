import { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabase'

export default function MaterialPreview({ 
  activityTypeId, 
  stageId,
  selectedBlocks, 
  blocks 
}) {
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(false)
  const [warning, setWarning] = useState('')

  useEffect(() => {
    if (activityTypeId && selectedBlocks.length > 0) {
      fetchMaterialPreview()
    } else {
      setMaterials([])
      setWarning('')
    }
  }, [activityTypeId, stageId, selectedBlocks])

  const fetchMaterialPreview = async () => {
    setLoading(true)
    setWarning('')
    
    // Query SOP materials
    let query = supabase
      .from('activity_materials')
      .select('*, materials(code, name, unit)')
      .eq('activity_type_id', activityTypeId)
    
    // Filter by stage
    if (stageId) {
      query = query.eq('stage_id', stageId)
    } else {
      query = query.is('stage_id', null)
    }

    const { data: sopMaterials, error } = await query
    
    console.log('🔍 Material preview query:', {
      activity: activityTypeId,
      stage: stageId,
      results: sopMaterials?.length || 0,
      error
    })

    if (error) {
      console.error('Material query error:', error)
      setWarning('Error loading materials: ' + error.message)
      setLoading(false)
      return
    }

    if (!sopMaterials || sopMaterials.length === 0) {
      setWarning('⚠️ Tidak ada SOP material untuk activity/stage ini. Hubungi admin untuk setup SOP.')
      setMaterials([])
      setLoading(false)
      return
    }

    // Calculate totals per material grouped by kategori
    const materialGroups = {}
    const skippedBlocks = { PC: [], RC: [] }
    
    selectedBlocks.forEach(blockId => {
      const block = blocks.find(b => b.id === blockId)
      if (!block) return
      
      let blockHasMaterial = false
      
      sopMaterials.forEach(am => {
        // Filter by kategori
        if (am.tanaman_kategori && am.tanaman_kategori !== block.kategori) {
          skippedBlocks[block.kategori].push(block.code)
          return
        }

        blockHasMaterial = true
        const key = `${am.material_id}_${block.kategori || 'ALL'}`
        
        if (!materialGroups[key]) {
          materialGroups[key] = {
            material_id: am.material_id,
            code: am.materials.code,
            name: am.materials.name,
            unit: am.unit,
            dosis_asli: am.default_dosis,
            kategori: block.kategori,
            total_quantity: 0,
            blocks: []
          }
        }
        
        const quantity = parseFloat(am.default_dosis) * parseFloat(block.luas_total)
        materialGroups[key].total_quantity += quantity
        materialGroups[key].blocks.push({
          code: block.code,
          kategori: block.kategori,
          luas: parseFloat(block.luas_total),
          quantity: quantity
        })
      })
    })

    setMaterials(Object.values(materialGroups))
    
    // Show warning if some blocks were skipped
    const warnings = []
    if (skippedBlocks.PC.length > 0) {
      warnings.push(`PC blocks skipped (tidak ada SOP): ${skippedBlocks.PC.join(', ')}`)
    }
    if (skippedBlocks.RC.length > 0) {
      warnings.push(`RC blocks skipped (tidak ada SOP): ${skippedBlocks.RC.join(', ')}`)
    }
    if (warnings.length > 0) {
      setWarning('ℹ️ ' + warnings.join('; '))
    }
    
    setLoading(false)
  }

  if (selectedBlocks.length === 0) {
    return (
      <div className="bg-gray-50 rounded p-4 text-sm text-gray-600 text-center">
        Pilih blok terlebih dahulu untuk melihat preview material
      </div>
    )
  }

  if (loading) {
    return (
      <div className="bg-gray-50 rounded p-4 text-sm text-gray-600 text-center">
        Loading material preview...
      </div>
    )
  }

  if (warning && materials.length === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded p-4 text-sm text-yellow-800">
        {warning}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {warning && (
        <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
          {warning}
        </div>
      )}
      
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-green-50 px-4 py-2 border-b">
          <h3 className="font-semibold text-sm">📋 Preview Material Rencana</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Kategori</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Dosis/Ha</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total Rencana</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {materials.map((m, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">{m.code} - {m.name}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      m.kategori === 'PC' ? 'bg-blue-100 text-blue-800' : 
                      m.kategori === 'RC' ? 'bg-green-100 text-green-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {m.kategori || 'ALL'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-gray-600">{m.dosis_asli} {m.unit}</td>
                  <td className="px-3 py-2 text-right font-semibold text-green-600">
                    {m.total_quantity.toFixed(2)} {m.unit}
                  </td>
                  <td className="px-3 py-2">
                    <details className="text-xs text-gray-600">
                      <summary className="cursor-pointer hover:text-blue-600 select-none">
                        {m.blocks.length} blok →
                      </summary>
                      <ul className="mt-1 ml-4 space-y-1">
                        {m.blocks.map((b, i) => (
                          <li key={i}>
                            {b.code} ({b.kategori}): {b.luas} Ha × {m.dosis_asli} = {b.quantity.toFixed(2)} {m.unit}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr className="font-semibold">
                <td colSpan="3" className="px-3 py-2 text-right">Total Jenis Material:</td>
                <td className="px-3 py-2 text-right text-blue-600">{materials.length} jenis</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      
      <div className="text-xs text-gray-600 bg-gray-50 rounded p-2">
        💡 <strong>Catatan:</strong> Material akan otomatis dihitung saat rencana disimpan.
        Pastikan jumlah sesuai dengan kebutuhan lapangan.
      </div>
    </div>
  )
}
 
  activityTypeId, 
  treatmentId, 
  stageId, 
  selectedBlocks, 
  blocks 
}) {
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (activityTypeId && treatmentId && selectedBlocks.length > 0) {
      fetchMaterialPreview()
    } else {
      setMaterials([])
    }
  }, [activityTypeId, treatmentId, stageId, selectedBlocks])

  const fetchMaterialPreview = async () => {
    setLoading(true)
    
    // Query SOP materials
    let query = supabase
      .from('activity_materials')
      .select('*, materials(code, name, unit)')
      .eq('activity_type_id', activityTypeId)
      .eq('treatment_id', treatmentId)
    
    if (stageId) {
      query = query.eq('stage_id', stageId)
    } else {
      query = query.is('stage_id', null)
    }

    const { data: sopMaterials } = await query

    if (sopMaterials && sopMaterials.length > 0) {
      // Calculate totals per material
      const materialGroups = {}
      
      selectedBlocks.forEach(blockId => {
        const block = blocks.find(b => b.id === blockId)
        if (!block) return
        
        sopMaterials.forEach(am => {
          // Filter by kategori
          if (am.tanaman_kategori && am.tanaman_kategori !== block.kategori) return

          const key = am.material_id
          if (!materialGroups[key]) {
            materialGroups[key] = {
              material_id: am.material_id,
              code: am.materials.code,
              name: am.materials.name,
              unit: am.unit,
              dosis_asli: am.default_dosis,
              total_quantity: 0,
              blocks: []
            }
          }
          
          const quantity = parseFloat(am.default_dosis) * parseFloat(block.luas_total)
          materialGroups[key].total_quantity += quantity
          materialGroups[key].blocks.push({
            code: block.code,
            kategori: block.kategori,
            luas: block.luas_total,
            quantity: quantity
          })
        })
      })

      setMaterials(Object.values(materialGroups))
    } else {
      setMaterials([])
    }
    
    setLoading(false)
  }

  if (selectedBlocks.length === 0) {
    return (
      <div className="bg-gray-50 rounded p-4 text-sm text-gray-600 text-center">
        Pilih blok terlebih dahulu untuk melihat preview material
      </div>
    )
  }

  if (loading) {
    return (
      <div className="bg-gray-50 rounded p-4 text-sm text-gray-600 text-center">
        Loading material preview...
      </div>
    )
  }

  if (materials.length === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded p-4 text-sm text-yellow-800">
        ⚠️ Tidak ada SOP material untuk treatment/stage ini
      </div>
    )
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="bg-blue-50 px-4 py-2 border-b">
        <h3 className="font-semibold text-sm">📋 Preview Material (Rencana)</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Dosis Asli</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total Rencana</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {materials.map(m => (
              <tr key={m.material_id}>
                <td className="px-3 py-2 font-medium">{m.code} - {m.name}</td>
                <td className="px-3 py-2 text-right">{m.dosis_asli} {m.unit}/Ha</td>
                <td className="px-3 py-2 text-right font-semibold text-green-600">
                  {m.total_quantity.toFixed(2)} {m.unit}
                </td>
                <td className="px-3 py-2">
                  <details className="text-xs text-gray-600">
                    <summary className="cursor-pointer hover:text-blue-600">
                      {m.blocks.length} blok
                    </summary>
                    <ul className="mt-1 ml-4 space-y-1">
                      {m.blocks.map((b, i) => (
                        <li key={i}>
                          {b.code} ({b.kategori}): {b.luas} Ha × {m.dosis_asli} = {b.quantity.toFixed(2)} {m.unit}
                        </li>
                      ))}
                    </ul>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 font-semibold">
            <tr>
              <td colSpan="2" className="px-3 py-2 text-right">Total Material:</td>
              <td className="px-3 py-2 text-right text-blue-600">{materials.length} jenis</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
