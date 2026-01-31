import { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabase'

export default function Assignment({ user }) {
  const [activeTab, setActiveTab] = useState('section')
  const [vendors, setVendors] = useState([])
  const [sections, setSections] = useState([])
  const [activities, setActivities] = useState([])
  const [materials, setMaterials] = useState([])
  const [stages, setStages] = useState([])
  
  const [sectionActivities, setSectionActivities] = useState([])
  const [vendorAssignments, setVendorAssignments] = useState([])
  const [activityMaterials, setActivityMaterials] = useState([])
  
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({})

  useEffect(() => {
    fetchMasterData()
    fetchAssignments()
  }, [activeTab])

  const fetchMasterData = async () => {
    const [v, s, a, m, st] = await Promise.all([
      supabase.from('vendors').select('*').eq('active', true).order('name'),
      supabase.from('sections').select('*').eq('active', true).order('name'),
      supabase.from('activity_types').select('*').eq('active', true).order('name'),
      supabase.from('materials').select('*').eq('active', true).order('code'),
      supabase.from('activity_stages').select('*').eq('active', true).order('sequence_order')
    ])
    
    setVendors(v.data || [])
    setSections(s.data || [])
    setActivities(a.data || [])
    setMaterials(m.data || [])
    setStages(st.data || [])
  }

  const fetchAssignments = async () => {
    setLoading(true)
    
    if (activeTab === 'section') {
      const { data } = await supabase
        .from('section_activities')
        .select('*, sections(name, code), activity_types(name, code, requires_material, requires_vendor)')
        .order('created_at', { ascending: false })
      setSectionActivities(data || [])
    } else if (activeTab === 'vendor') {
      const { data } = await supabase
        .from('vendor_assignments')
        .select('*, vendors(name, code), sections(name, code), activity_types(name, code)')
        .order('created_at', { ascending: false })
      setVendorAssignments(data || [])
    } else {
      const { data } = await supabase
        .from('activity_materials')
        .select('*, activity_types(name, code), materials(code, name, unit), activity_stages(name)')
        .order('created_at', { ascending: false })
      setActivityMaterials(data || [])
    }
    
    setLoading(false)
  }

  // ========== SECTION ACTIVITIES ==========
  const handleNewSectionActivity = () => {
    setFormData({ section_id: '', activity_type_id: '' })
    setShowModal(true)
  }

  const handleSaveSectionActivity = async () => {
    if (!formData.section_id || !formData.activity_type_id) {
      alert('❌ Section dan Activity harus diisi!')
      return
    }

    // Check if already exists
    const { data: existing } = await supabase
      .from('section_activities')
      .select('id')
      .eq('section_id', formData.section_id)
      .eq('activity_type_id', formData.activity_type_id)
      .single()

    if (existing) {
      alert('⚠️ Assignment ini sudah ada!')
      return
    }

    const { error } = await supabase.from('section_activities').insert(formData)
    
    if (!error) {
      alert('✅ Section Activity berhasil ditambahkan')
      setShowModal(false)
      fetchAssignments()
    } else {
      alert('❌ Error: ' + error.message)
    }
  }

  // ========== VENDOR ASSIGNMENTS ==========
  const handleNewVendorAssignment = () => {
    setFormData({ vendor_id: '', section_id: '', activity_type_id: '' })
    setShowModal(true)
  }

  const handleSaveVendorAssignment = async () => {
    if (!formData.vendor_id || !formData.section_id || !formData.activity_type_id) {
      alert('❌ Vendor, Section, dan Activity harus diisi!')
      return
    }

    // VALIDASI 1: Cek apakah section punya activity ini
    const { data: sectionActivity } = await supabase
      .from('section_activities')
      .select('id')
      .eq('section_id', formData.section_id)
      .eq('activity_type_id', formData.activity_type_id)
      .eq('active', true)
      .single()

    if (!sectionActivity) {
      const section = sections.find(s => s.id === formData.section_id)
      const activity = activities.find(a => a.id === formData.activity_type_id)
      alert(`❌ VALIDASI GAGAL!\n\nSection "${section?.name}" belum punya assignment untuk activity "${activity?.name}".\n\nSilakan assign Section Activity terlebih dahulu di tab "Section Activities".`)
      return
    }

    // VALIDASI 2: Cek apakah sudah ada assignment
    const { data: existing } = await supabase
      .from('vendor_assignments')
      .select('id, vendors(name)')
      .eq('vendor_id', formData.vendor_id)
      .eq('section_id', formData.section_id)
      .eq('activity_type_id', formData.activity_type_id)
      .single()

    if (existing) {
      alert(`⚠️ Assignment ini sudah ada untuk vendor "${existing.vendors.name}"!`)
      return
    }

    const { error } = await supabase.from('vendor_assignments').insert(formData)
    
    if (!error) {
      alert('✅ Vendor Assignment berhasil ditambahkan')
      setShowModal(false)
      fetchAssignments()
    } else {
      alert('❌ Error: ' + error.message)
    }
  }

  // ========== MATERIAL SOP ==========
  const handleNewMaterialSOP = () => {
    setFormData({ 
      activity_type_id: '', 
      material_id: '', 
      stage_id: '', 
      tanaman_kategori: '', 
      alternative_option: '',
      default_dosis: '', 
      unit: 'liter', 
      required: false,
      display_order: 0
    })
    setShowModal(true)
  }

  const handleSaveMaterialSOP = async () => {
    if (!formData.activity_type_id || !formData.material_id || !formData.default_dosis) {
      alert('❌ Activity, Material, dan Dosis harus diisi!')
      return
    }

    const dataToSave = {
      ...formData,
      tanaman_kategori: formData.tanaman_kategori || null,
      stage_id: formData.stage_id || null,
      alternative_option: formData.alternative_option || null
    }
    
    const { error } = await supabase.from('activity_materials').insert(dataToSave)
    
    if (!error) {
      alert('✅ SOP Material berhasil ditambahkan')
      setShowModal(false)
      fetchAssignments()
    } else {
      alert('❌ Error: ' + error.message)
    }
  }

  // ========== DELETE ==========
  const handleDelete = async (id) => {
    if (!confirm('Yakin hapus assignment ini?')) return
    
    let table = ''
    let checkReferences = null
    
    if (activeTab === 'section') {
      table = 'section_activities'
      
      // Cek apakah ada vendor assignments yang bergantung
      const { data: vendorAssigns } = await supabase
        .from('vendor_assignments')
        .select('id, vendors(name)')
        .eq('section_id', sectionActivities.find(sa => sa.id === id)?.section_id)
        .eq('activity_type_id', sectionActivities.find(sa => sa.id === id)?.activity_type_id)
        .limit(1)
      
      if (vendorAssigns && vendorAssigns.length > 0) {
        alert(`❌ Tidak bisa hapus!\n\nMasih ada Vendor Assignment (${vendorAssigns[0].vendors.name}) yang menggunakan Section Activity ini.\n\nHapus Vendor Assignment terlebih dahulu.`)
        return
      }
      
    } else if (activeTab === 'vendor') {
      table = 'vendor_assignments'
      
      // Cek apakah ada planning yang menggunakan
      const assignment = vendorAssignments.find(va => va.id === id)
      const { data: plans } = await supabase
        .from('activity_plans')
        .select('id, target_bulan')
        .eq('section_id', assignment?.section_id)
        .eq('activity_type_id', assignment?.activity_type_id)
        .eq('vendor_id', assignment?.vendor_id)
        .limit(1)
      
      if (plans && plans.length > 0) {
        alert(`❌ Tidak bisa hapus!\n\nMasih ada Planning (${plans[0].target_bulan.slice(0, 7)}) yang menggunakan assignment ini.\n\nHapus atau ubah Planning terlebih dahulu.`)
        return
      }
      
    } else {
      table = 'activity_materials'
      
      // Cek apakah ada planned_materials yang menggunakan
      const material = activityMaterials.find(am => am.id === id)
      const { data: plannedMats } = await supabase
        .from('planned_materials')
        .select('id, activity_plans(target_bulan)')
        .eq('material_id', material?.material_id)
        .limit(1)
      
      if (plannedMats && plannedMats.length > 0) {
        alert(`❌ Tidak bisa hapus!\n\nMasih ada Planned Materials yang menggunakan SOP ini.\n\nHapus Planning terkait terlebih dahulu.`)
        return
      }
    }
    
    const { error } = await supabase.from(table).delete().eq('id', id)
    
    if (!error) {
      alert('✅ Assignment berhasil dihapus')
      fetchAssignments()
    } else {
      alert('❌ Error: ' + error.message)
    }
  }

  // ========== RENDER MODALS ==========
  const renderModal = () => {
    if (activeTab === 'section') {
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Section *</label>
            <select 
              value={formData.section_id || ''} 
              onChange={(e) => setFormData({...formData, section_id: e.target.value})} 
              className="w-full px-3 py-2 border rounded"
            >
              <option value="">Pilih Section</option>
              {sections.map(s => (
                <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Activity *</label>
            <select 
              value={formData.activity_type_id || ''} 
              onChange={(e) => setFormData({...formData, activity_type_id: e.target.value})} 
              className="w-full px-3 py-2 border rounded"
            >
              <option value="">Pilih Activity</option>
              {activities.map(a => (
                <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
              ))}
            </select>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm">
            <strong>ℹ️ Info:</strong> Section Activity menentukan activity apa saja yang bisa dilakukan oleh section ini.
          </div>
        </div>
      )
    } else if (activeTab === 'vendor') {
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Vendor *</label>
            <select 
              value={formData.vendor_id || ''} 
              onChange={(e) => setFormData({...formData, vendor_id: e.target.value})} 
              className="w-full px-3 py-2 border rounded"
            >
              <option value="">Pilih Vendor</option>
              {vendors.map(v => (
                <option key={v.id} value={v.id}>{v.code} - {v.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Section *</label>
            <select 
              value={formData.section_id || ''} 
              onChange={(e) => setFormData({...formData, section_id: e.target.value})} 
              className="w-full px-3 py-2 border rounded"
            >
              <option value="">Pilih Section</option>
              {sections.map(s => (
                <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Activity *</label>
            <select 
              value={formData.activity_type_id || ''} 
              onChange={(e) => setFormData({...formData, activity_type_id: e.target.value})} 
              className="w-full px-3 py-2 border rounded"
            >
              <option value="">Pilih Activity</option>
              {activities.map(a => (
                <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
              ))}
            </select>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded p-3 text-sm">
            <strong>⚠️ Perhatian:</strong> Section harus sudah punya assignment untuk activity ini di tab "Section Activities" terlebih dahulu!
          </div>
        </div>
      )
    } else {
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Activity *</label>
            <select 
              value={formData.activity_type_id || ''} 
              onChange={(e) => setFormData({...formData, activity_type_id: e.target.value})} 
              className="w-full px-3 py-2 border rounded"
            >
              <option value="">Pilih Activity</option>
              {activities.map(a => (
                <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Material *</label>
            <select 
              value={formData.material_id || ''} 
              onChange={(e) => setFormData({...formData, material_id: e.target.value})} 
              className="w-full px-3 py-2 border rounded"
            >
              <option value="">Pilih Material</option>
              {materials.map(m => (
                <option key={m.id} value={m.id}>{m.code} - {m.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Stage</label>
              <select 
                value={formData.stage_id || ''} 
                onChange={(e) => setFormData({...formData, stage_id: e.target.value})} 
                className="w-full px-3 py-2 border rounded"
              >
                <option value="">Semua Stage</option>
                {stages.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Kategori Tanaman</label>
              <select 
                value={formData.tanaman_kategori || ''} 
                onChange={(e) => setFormData({...formData, tanaman_kategori: e.target.value})} 
                className="w-full px-3 py-2 border rounded"
              >
                <option value="">All</option>
                <option value="PC">PC</option>
                <option value="RC">RC</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Alternative Option</label>
            <input 
              type="text" 
              value={formData.alternative_option || ''} 
              onChange={(e) => setFormData({...formData, alternative_option: e.target.value})} 
              placeholder="Normal A, Alt 1, dst" 
              className="w-full px-3 py-2 border rounded" 
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Dosis Default *</label>
              <input 
                type="number" 
                step="0.001" 
                value={formData.default_dosis || ''} 
                onChange={(e) => setFormData({...formData, default_dosis: e.target.value})} 
                className="w-full px-3 py-2 border rounded" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Unit *</label>
              <select 
                value={formData.unit || 'liter'} 
                onChange={(e) => setFormData({...formData, unit: e.target.value})} 
                className="w-full px-3 py-2 border rounded"
              >
                <option value="liter">Liter</option>
                <option value="kg">Kg</option>
                <option value="gram">Gram</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input 
              type="checkbox" 
              checked={formData.required || false} 
              onChange={(e) => setFormData({...formData, required: e.target.checked})} 
              className="w-4 h-4" 
            />
            <label className="text-sm">Material Wajib</label>
          </div>
        </div>
      )
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Assignment Management</h1>
        <div className="text-sm text-gray-600">
          Setup assignment sebelum membuat planning
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="border-b">
          <div className="flex space-x-1">
            <button
              onClick={() => setActiveTab('section')}
              className={`px-6 py-3 text-sm font-medium ${
                activeTab === 'section' 
                  ? 'border-b-2 border-blue-600 text-blue-600' 
                  : 'text-gray-600 hover:text-blue-600'
              }`}
            >
              📍 Section Activities
            </button>
            <button
              onClick={() => setActiveTab('vendor')}
              className={`px-6 py-3 text-sm font-medium ${
                activeTab === 'vendor' 
                  ? 'border-b-2 border-blue-600 text-blue-600' 
                  : 'text-gray-600 hover:text-blue-600'
              }`}
            >
              🏢 Vendor Assignment
            </button>
            <button
              onClick={() => setActiveTab('material')}
              className={`px-6 py-3 text-sm font-medium ${
                activeTab === 'material' 
                  ? 'border-b-2 border-blue-600 text-blue-600' 
                  : 'text-gray-600 hover:text-blue-600'
              }`}
            >
              🧪 Activity Materials (SOP)
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <button 
              onClick={
                activeTab === 'section' ? handleNewSectionActivity :
                activeTab === 'vendor' ? handleNewVendorAssignment :
                handleNewMaterialSOP
              } 
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              + Tambah {
                activeTab === 'section' ? 'Section Activity' :
                activeTab === 'vendor' ? 'Vendor Assignment' :
                'SOP Material'
              }
            </button>
            <div className="text-sm text-gray-600">
              Total: {
                activeTab === 'section' ? sectionActivities.length :
                activeTab === 'vendor' ? vendorAssignments.length :
                activityMaterials.length
              } data
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8">Loading...</div>
          ) : (
            <div className="overflow-x-auto">
              {activeTab === 'section' && (
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Section</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Activity</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {sectionActivities.map(item => (
                      <tr key={item.id}>
                        <td className="px-4 py-3 text-sm">
                          <div className="font-medium">{item.sections?.code}</div>
                          <div className="text-xs text-gray-600">{item.sections?.name}</div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="font-medium">{item.activity_types?.code}</div>
                          <div className="text-xs text-gray-600">{item.activity_types?.name}</div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex gap-1">
                            {item.activity_types?.requires_material && (
                              <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs">Material</span>
                            )}
                            {item.activity_types?.requires_vendor && (
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs">Vendor</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:text-red-800">Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {activeTab === 'vendor' && (
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Section</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Activity</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {vendorAssignments.map(item => (
                      <tr key={item.id}>
                        <td className="px-4 py-3 text-sm">
                          <div className="font-medium">{item.vendors?.code}</div>
                          <div className="text-xs text-gray-600">{item.vendors?.name}</div>
                        </td>
                        <td className="px-4 py-3 text-sm">{item.sections?.name}</td>
                        <td className="px-4 py-3 text-sm">{item.activity_types?.name}</td>
                        <td className="px-4 py-3 text-sm">
                          <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:text-red-800">Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {activeTab === 'material' && (
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Activity</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stage</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kategori</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Alternative</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dosis</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {activityMaterials.map(item => (
                      <tr key={item.id}>
                        <td className="px-4 py-3 text-sm">{item.activity_types?.name}</td>
                        <td className="px-4 py-3 text-sm font-medium">{item.materials?.code} - {item.materials?.name}</td>
                        <td className="px-4 py-3 text-sm">{item.activity_stages?.name || '-'}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 rounded text-xs ${
                            item.tanaman_kategori === 'PC' ? 'bg-blue-100 text-blue-800' : 
                            item.tanaman_kategori === 'RC' ? 'bg-green-100 text-green-800' : 
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {item.tanaman_kategori || 'All'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">{item.alternative_option || '-'}</td>
                        <td className="px-4 py-3 text-sm">{item.default_dosis} {item.unit}</td>
                        <td className="px-4 py-3 text-sm">
                          <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:text-red-800">Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              Tambah {
                activeTab === 'section' ? 'Section Activity' :
                activeTab === 'vendor' ? 'Vendor Assignment' :
                'SOP Material'
              }
            </h2>
            
            {renderModal()}

            <div className="flex justify-end gap-2 mt-6">
              <button 
                onClick={() => setShowModal(false)} 
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Batal
              </button>
              <button 
                onClick={
                  activeTab === 'section' ? handleSaveSectionActivity :
                  activeTab === 'vendor' ? handleSaveVendorAssignment :
                  handleSaveMaterialSOP
                } 
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}