import { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabase'

export default function Assignment({ user }) {
  const [activeTab, setActiveTab] = useState('vendor')
  const [vendors, setVendors] = useState([])
  const [sections, setSections] = useState([])
  const [activities, setActivities] = useState([])
  const [materials, setMaterials] = useState([])
  const [stages, setStages] = useState([])
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
      supabase.from('vendors').select('*').eq('active', true),
      supabase.from('sections').select('*').eq('active', true),
      supabase.from('activity_types').select('*').eq('active', true),
      supabase.from('materials').select('*').eq('active', true),
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
    if (activeTab === 'vendor') {
      const { data } = await supabase
        .from('vendor_assignments')
        .select('*, vendors(name), sections(name), activity_types(name)')
        .order('created_at', { ascending: false })
      setVendorAssignments(data || [])
    } else {
      const { data } = await supabase
        .from('activity_materials')
        .select('*, activity_types(name), materials(code, name), activity_stages(name)')
        .order('created_at', { ascending: false })
      setActivityMaterials(data || [])
    }
    setLoading(false)
  }

  const handleNewVendorAssignment = () => {
    setFormData({ vendor_id: '', section_id: '', activity_type_id: '' })
    setShowModal(true)
  }

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

  const handleSaveVendorAssignment = async () => {
    const { error } = await supabase.from('vendor_assignments').insert(formData)
    if (!error) {
      alert('✅ Assignment berhasil ditambahkan')
      setShowModal(false)
      fetchAssignments()
    } else {
      alert('❌ Error: ' + error.message)
    }
  }

  const handleSaveMaterialSOP = async () => {
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

  const handleDelete = async (id) => {
    if (!confirm('Yakin hapus assignment ini?')) return
    
    const table = activeTab === 'vendor' ? 'vendor_assignments' : 'activity_materials'
    const { error } = await supabase.from(table).delete().eq('id', id)
    
    if (!error) {
      alert('✅ Assignment berhasil dihapus')
      fetchAssignments()
    } else {
      alert('❌ Error: ' + error.message)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Assignment Management</h1>

      <div className="bg-white rounded-lg shadow">
        <div className="border-b">
          <div className="flex space-x-4">
            <button
              onClick={() => setActiveTab('vendor')}
              className={`px-6 py-3 text-sm font-medium ${activeTab === 'vendor' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}
            >
              🏢 Vendor Assignment
            </button>
            <button
              onClick={() => setActiveTab('material')}
              className={`px-6 py-3 text-sm font-medium ${activeTab === 'material' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}
            >
              🧪 Activity Materials (SOP)
            </button>
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'vendor' ? (
            <>
              <div className="flex justify-between items-center mb-4">
                <button onClick={handleNewVendorAssignment} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">+ Assign Vendor</button>
                <div className="text-sm text-gray-600">Total: {vendorAssignments.length} assignments</div>
              </div>

              {loading ? (
                <div className="text-center py-8">Loading...</div>
              ) : (
                <div className="overflow-x-auto">
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
                          <td className="px-4 py-3 text-sm">{item.vendors?.name}</td>
                          <td className="px-4 py-3 text-sm">{item.sections?.name}</td>
                          <td className="px-4 py-3 text-sm">{item.activity_types?.name}</td>
                          <td className="px-4 py-3 text-sm">
                            <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:text-red-800">Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex justify-between items-center mb-4">
                <button onClick={handleNewMaterialSOP} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">+ Tambah SOP Material</button>
                <div className="text-sm text-gray-600">Total: {activityMaterials.length} SOP</div>
              </div>

              {loading ? (
                <div className="text-center py-8">Loading...</div>
              ) : (
                <div className="overflow-x-auto">
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
                          <td className="px-4 py-3 text-sm"><span className={`px-2 py-1 rounded text-xs ${item.tanaman_kategori === 'PC' ? 'bg-blue-100 text-blue-800' : item.tanaman_kategori === 'RC' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{item.tanaman_kategori || 'All'}</span></td>
                          <td className="px-4 py-3 text-sm">{item.alternative_option || '-'}</td>
                          <td className="px-4 py-3 text-sm">{item.default_dosis} {item.unit}</td>
                          <td className="px-4 py-3 text-sm">
                            <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:text-red-800">Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl">
            <h2 className="text-xl font-bold mb-4">{activeTab === 'vendor' ? 'Assign Vendor' : 'Tambah SOP Material'}</h2>
            
            {activeTab === 'vendor' ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Vendor *</label>
                  <select value={formData.vendor_id || ''} onChange={(e) => setFormData({...formData, vendor_id: e.target.value})} className="w-full px-3 py-2 border rounded" required>
                    <option value="">Pilih Vendor</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Section *</label>
                  <select value={formData.section_id || ''} onChange={(e) => setFormData({...formData, section_id: e.target.value})} className="w-full px-3 py-2 border rounded" required>
                    <option value="">Pilih Section</option>
                    {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Activity *</label>
                  <select value={formData.activity_type_id || ''} onChange={(e) => setFormData({...formData, activity_type_id: e.target.value})} className="w-full px-3 py-2 border rounded" required>
                    <option value="">Pilih Activity</option>
                    {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Activity *</label>
                  <select value={formData.activity_type_id || ''} onChange={(e) => setFormData({...formData, activity_type_id: e.target.value})} className="w-full px-3 py-2 border rounded" required>
                    <option value="">Pilih Activity</option>
                    {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Material *</label>
                  <select value={formData.material_id || ''} onChange={(e) => setFormData({...formData, material_id: e.target.value})} className="w-full px-3 py-2 border rounded" required>
                    <option value="">Pilih Material</option>
                    {materials.map(m => <option key={m.id} value={m.id}>{m.code} - {m.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Stage</label>
                    <select value={formData.stage_id || ''} onChange={(e) => setFormData({...formData, stage_id: e.target.value})} className="w-full px-3 py-2 border rounded">
                      <option value="">Semua Stage</option>
                      {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Kategori Tanaman</label>
                    <select value={formData.tanaman_kategori || ''} onChange={(e) => setFormData({...formData, tanaman_kategori: e.target.value})} className="w-full px-3 py-2 border rounded">
                      <option value="">All</option>
                      <option value="PC">PC</option>
                      <option value="RC">RC</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Alternative Option</label>
                  <input type="text" value={formData.alternative_option || ''} onChange={(e) => setFormData({...formData, alternative_option: e.target.value})} placeholder="Normal A, Alt 1, dst" className="w-full px-3 py-2 border rounded" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Dosis Default *</label>
                    <input type="number" step="0.001" value={formData.default_dosis || ''} onChange={(e) => setFormData({...formData, default_dosis: e.target.value})} className="w-full px-3 py-2 border rounded" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Unit *</label>
                    <select value={formData.unit || 'liter'} onChange={(e) => setFormData({...formData, unit: e.target.value})} className="w-full px-3 py-2 border rounded">
                      <option value="liter">Liter</option>
                      <option value="kg">Kg</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center">
                  <input type="checkbox" checked={formData.required || false} onChange={(e) => setFormData({...formData, required: e.target.checked})} className="w-4 h-4 mr-2" />
                  <label className="text-sm">Material Wajib</label>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border rounded hover:bg-gray-50">Batal</button>
              <button onClick={activeTab === 'vendor' ? handleSaveVendorAssignment : handleSaveMaterialSOP} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
