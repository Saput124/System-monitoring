import { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabase'

export default function Assignment({ user }) {
  const [activeTab, setActiveTab] = useState('vendor')
  const [sections, setSections] = useState([])
  const [activities, setActivities] = useState([])
  const [vendors, setVendors] = useState([])
  const [materials, setMaterials] = useState([])
  const [vendorAssignments, setVendorAssignments] = useState([])
  const [activityMaterials, setActivityMaterials] = useState([])
  const [stages, setStages] = useState([])
  
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    section_id: '',
    activity_id: '',
    vendor_id: '',
    kategori: 'PC',
    stage_code: '',
    stage_name: '',
    materials: []
  })
  
  useEffect(() => {
    fetchMasterData()
    if (activeTab === 'vendor') fetchVendorAssignments()
    if (activeTab === 'material') fetchActivityMaterials()
  }, [activeTab])
  
  const fetchMasterData = async () => {
    const [s, a, v, m] = await Promise.all([
      supabase.from('sections').select('*').eq('active', true),
      supabase.from('activities').select('*, sections(name)').eq('active', true),
      supabase.from('vendors').select('*').eq('active', true),
      supabase.from('materials').select('*').eq('active', true).order('category, name')
    ])
    setSections(s.data || [])
    setActivities(a.data || [])
    setVendors(v.data || [])
    setMaterials(m.data || [])
  }
  
  const fetchVendorAssignments = async () => {
    const { data } = await supabase
      .from('vendor_assignments')
      .select(`*, sections(name), activities(name), vendors(name)`)
      .eq('active', true)
    setVendorAssignments(data || [])
  }
  
  const fetchActivityMaterials = async () => {
    const { data } = await supabase
      .from('activity_materials')
      .select(`
        *,
        activities(name, sections(name)),
        activity_stages(name, kategori),
        materials(code, name, unit)
      `)
    setActivityMaterials(data || [])
  }
  
  const handleActivityChange = async (activityId) => {
    setFormData({...formData, activity_id: activityId, materials: []})
    
    const { data } = await supabase
      .from('activity_stages')
      .select('*')
      .eq('activity_id', activityId)
      .eq('kategori', formData.kategori)
      .order('sequence_order')
    
    setStages(data || [])
  }
  
  const handleKategoriChange = async (kategori) => {
    setFormData({...formData, kategori, materials: []})
    
    if (formData.activity_id) {
      const { data } = await supabase
        .from('activity_stages')
        .select('*')
        .eq('activity_id', formData.activity_id)
        .eq('kategori', kategori)
        .order('sequence_order')
      
      setStages(data || [])
    }
  }
  
  const handleMaterialToggle = (materialId) => {
    const exists = formData.materials.find(m => m.material_id === materialId)
    if (exists) {
      setFormData({
        ...formData,
        materials: formData.materials.filter(m => m.material_id !== materialId)
      })
    } else {
      const material = materials.find(m => m.id === materialId)
      setFormData({
        ...formData,
        materials: [...formData.materials, {
          material_id: materialId,
          default_dosis: 0,
          unit: material.unit
        }]
      })
    }
  }
  
  const handleDosisChange = (materialId, dosis) => {
    setFormData({
      ...formData,
      materials: formData.materials.map(m => 
        m.material_id === materialId ? {...m, default_dosis: parseFloat(dosis) || 0} : m
      )
    })
  }
  
  const saveVendorAssignment = async () => {
    const { error } = await supabase.from('vendor_assignments').insert({
      section_id: formData.section_id,
      activity_id: formData.activity_id,
      vendor_id: formData.vendor_id
    })
    
    if (error) {
      alert('Error: ' + error.message)
    } else {
      alert('✅ Vendor assignment saved!')
      setShowModal(false)
      fetchVendorAssignments()
    }
  }
  
  const saveMaterialAssignment = async () => {
    if (!formData.stage_code || !formData.stage_name) {
      alert('Isi stage code dan name!')
      return
    }
    
    if (formData.materials.length === 0) {
      alert('Pilih minimal 1 material!')
      return
    }
    
    // Create or get stage
    let stageId
    const { data: existingStage } = await supabase
      .from('activity_stages')
      .select('id')
      .eq('activity_id', formData.activity_id)
      .eq('kategori', formData.kategori)
      .eq('code', formData.stage_code)
      .single()
    
    if (existingStage) {
      stageId = existingStage.id
    } else {
      const { data: newStage, error: stageError } = await supabase
        .from('activity_stages')
        .insert({
          activity_id: formData.activity_id,
          kategori: formData.kategori,
          code: formData.stage_code,
          name: formData.stage_name,
          sequence_order: stages.length + 1
        })
        .select()
        .single()
      
      if (stageError) {
        alert('Error creating stage: ' + stageError.message)
        return
      }
      stageId = newStage.id
    }
    
    // Insert materials
    const materialRecords = formData.materials.map(m => ({
      activity_id: formData.activity_id,
      stage_id: stageId,
      material_id: m.material_id,
      default_dosis: m.default_dosis,
      unit: m.unit
    }))
    
    const { error } = await supabase.from('activity_materials').insert(materialRecords)
    
    if (error) {
      alert('Error: ' + error.message)
    } else {
      alert('✅ Material assignment saved!')
      setShowModal(false)
      setFormData({...formData, materials: [], stage_code: '', stage_name: ''})
      fetchActivityMaterials()
    }
  }
  
  const deleteVendorAssignment = async (id) => {
    if (confirm('Hapus assignment?')) {
      await supabase.from('vendor_assignments').delete().eq('id', id)
      fetchVendorAssignments()
    }
  }
  
  const deleteMaterialAssignment = async (id) => {
    if (confirm('Hapus material?')) {
      await supabase.from('activity_materials').delete().eq('id', id)
      fetchActivityMaterials()
    }
  }
  
  const herbisida = materials.filter(m => m.category === 'herbisida')
  const pupuk = materials.filter(m => m.category === 'pupuk')
  const insektisida = materials.filter(m => m.category === 'insektisida')
  
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Assignment</h1>
      
      <div className="bg-white rounded-lg shadow">
        <div className="border-b">
          <div className="flex">
            <button
              onClick={() => setActiveTab('vendor')}
              className={`px-6 py-3 ${activeTab === 'vendor' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
            >
              Vendor Assignment
            </button>
            <button
              onClick={() => setActiveTab('material')}
              className={`px-6 py-3 ${activeTab === 'material' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
            >
              Activity Materials
            </button>
          </div>
        </div>
        
        <div className="p-6">
          {activeTab === 'vendor' ? (
            <>
              <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-blue-600 text-white rounded mb-4">
                + Assign Vendor
              </button>
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left">Section</th>
                    <th className="px-4 py-2 text-left">Activity</th>
                    <th className="px-4 py-2 text-left">Vendor</th>
                    <th className="px-4 py-2 text-left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {vendorAssignments.map(va => (
                    <tr key={va.id} className="border-b">
                      <td className="px-4 py-2">{va.sections?.name}</td>
                      <td className="px-4 py-2">{va.activities?.name}</td>
                      <td className="px-4 py-2">{va.vendors?.name}</td>
                      <td className="px-4 py-2">
                        <button onClick={() => deleteVendorAssignment(va.id)} className="text-red-600">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <>
              <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-blue-600 text-white rounded mb-4">
                + Setup Material
              </button>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Section</th>
                    <th className="px-3 py-2 text-left">Activity</th>
                    <th className="px-3 py-2 text-left">Kategori</th>
                    <th className="px-3 py-2 text-left">Stage</th>
                    <th className="px-3 py-2 text-left">Material</th>
                    <th className="px-3 py-2 text-right">Dosis</th>
                    <th className="px-3 py-2 text-left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {activityMaterials.map(am => (
                    <tr key={am.id} className="border-b">
                      <td className="px-3 py-2">{am.activities?.sections?.name}</td>
                      <td className="px-3 py-2">{am.activities?.name}</td>
                      <td className="px-3 py-2">{am.activity_stages?.kategori}</td>
                      <td className="px-3 py-2">{am.activity_stages?.name}</td>
                      <td className="px-3 py-2">{am.materials?.code} - {am.materials?.name}</td>
                      <td className="px-3 py-2 text-right">{am.default_dosis} {am.unit}</td>
                      <td className="px-3 py-2">
                        <button onClick={() => deleteMaterialAssignment(am.id)} className="text-red-600 text-xs">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
      
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto m-4">
            <h2 className="text-xl font-bold mb-4">
              {activeTab === 'vendor' ? 'Assign Vendor' : 'Setup Material'}
            </h2>
            
            {activeTab === 'vendor' ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Section</label>
                  <select value={formData.section_id} onChange={(e) => setFormData({...formData, section_id: e.target.value})} className="w-full px-3 py-2 border rounded">
                    <option value="">Pilih Section</option>
                    {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Activity</label>
                  <select value={formData.activity_id} onChange={(e) => setFormData({...formData, activity_id: e.target.value})} className="w-full px-3 py-2 border rounded">
                    <option value="">Pilih Activity</option>
                    {activities.filter(a => a.section_id === formData.section_id).map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Vendor</label>
                  <select value={formData.vendor_id} onChange={(e) => setFormData({...formData, vendor_id: e.target.value})} className="w-full px-3 py-2 border rounded">
                    <option value="">Pilih Vendor</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowModal(false)} className="px-4 py-2 border rounded">Batal</button>
                  <button onClick={saveVendorAssignment} className="px-4 py-2 bg-blue-600 text-white rounded">Simpan</button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Activity</label>
                  <select value={formData.activity_id} onChange={(e) => handleActivityChange(e.target.value)} className="w-full px-3 py-2 border rounded">
                    <option value="">Pilih Activity</option>
                    {activities.map(a => (
                      <option key={a.id} value={a.id}>{a.sections?.name} - {a.name}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Kategori</label>
                  <select value={formData.kategori} onChange={(e) => handleKategoriChange(e.target.value)} className="w-full px-3 py-2 border rounded">
                    <option value="PC">PC</option>
                    <option value="RC">RC</option>
                    <option value="ALL">ALL</option>
                  </select>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Stage Code</label>
                    <input type="text" value={formData.stage_code} onChange={(e) => setFormData({...formData, stage_code: e.target.value})} placeholder="NORMAL_A" className="w-full px-3 py-2 border rounded" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Stage Name</label>
                    <input type="text" value={formData.stage_name} onChange={(e) => setFormData({...formData, stage_name: e.target.value})} placeholder="Normal A" className="w-full px-3 py-2 border rounded" />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Materials (Herbisida)</label>
                  <div className="border rounded p-4 space-y-2 max-h-60 overflow-y-auto">
                    {herbisida.map(m => {
                      const selected = formData.materials.find(mat => mat.material_id === m.id)
                      return (
                        <div key={m.id} className="flex items-center gap-3">
                          <input type="checkbox" checked={!!selected} onChange={() => handleMaterialToggle(m.id)} className="w-4 h-4" />
                          <span className="flex-1">{m.code} - {m.name}</span>
                          {selected && (
                            <>
                              <input type="number" step="0.01" value={selected.default_dosis} onChange={(e) => handleDosisChange(m.id, e.target.value)} placeholder="Dosis" className="w-24 px-2 py-1 border rounded text-sm" />
                              <span className="text-sm text-gray-600">{m.unit}/Ha</span>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
                
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowModal(false)} className="px-4 py-2 border rounded">Batal</button>
                  <button onClick={saveMaterialAssignment} className="px-4 py-2 bg-blue-600 text-white rounded">Simpan</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
