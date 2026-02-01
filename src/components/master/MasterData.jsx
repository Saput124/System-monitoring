import { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabase'
import * as XLSX from 'xlsx'

export default function MasterData({ user }) {
  const [activeTab, setActiveTab] = useState('blocks')
  const [data, setData] = useState([])
  const [vendors, setVendors] = useState([])
  const [sections, setSections] = useState([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editData, setEditData] = useState(null)
  const [formData, setFormData] = useState({})

  const tabs = [
    { id: 'blocks', label: '🗺️ Blocks', table: 'blocks' },
    { id: 'materials', label: '🛢 Materials', table: 'materials' },
    { id: 'vendors', label: '👷 Vendors', table: 'vendors' },
    { id: 'workers', label: '👥 Workers', table: 'workers' },
    { id: 'sections', label: '📍 Sections', table: 'sections' },
    { id: 'activities', label: '⚙️ Activities', table: 'activity_types' },
    { id: 'users', label: '👤 Users', table: 'users' }
  ]

  useEffect(() => {
    fetchMasterData()
    fetchData()
  }, [activeTab])

  const fetchMasterData = async () => {
    const [v, s] = await Promise.all([
      supabase.from('vendors').select('*').eq('active', true),
      supabase.from('sections').select('*').eq('active', true)
    ])
    setVendors(v.data || [])
    setSections(s.data || [])
  }

  const fetchData = async () => {
    setLoading(true)
    const tab = tabs.find(t => t.id === activeTab)
    
    let query = supabase.from(tab.table).select('*').order('created_at', { ascending: false })
    
    if (activeTab === 'workers') {
      query = supabase.from('workers').select('*, vendors(name)').order('created_at', { ascending: false })
    } else if (activeTab === 'users') {
      query = supabase.from('users').select('*, sections(name), vendors(name)').order('created_at', { ascending: false })
    }

    const { data: result, error } = await query
    
    if (!error) setData(result || [])
    setLoading(false)
  }

  const handleNew = () => {
    setEditData(null)
    setFormData(getEmptyForm())
    setShowModal(true)
  }

  const handleEdit = (item) => {
    setEditData(item)
    setFormData(item)
    setShowModal(true)
  }

  const handleDelete = async (id) => {
    if (!confirm('Yakin hapus data ini?')) return
    
    const tab = tabs.find(t => t.id === activeTab)
    const { error } = await supabase.from(tab.table).delete().eq('id', id)
    
    if (!error) {
      alert('✅ Data berhasil dihapus')
      fetchData()
    } else {
      alert('❌ Error: ' + error.message)
    }
  }

  const handleSave = async () => {
    const tab = tabs.find(t => t.id === activeTab)
    
    if (editData) {
      const { error } = await supabase.from(tab.table).update(formData).eq('id', editData.id)
      if (!error) {
        alert('✅ Data berhasil diupdate')
        setShowModal(false)
        fetchData()
      } else {
        alert('❌ Error: ' + error.message)
      }
    } else {
      const { error } = await supabase.from(tab.table).insert(formData)
      if (!error) {
        alert('✅ Data berhasil ditambahkan')
        setShowModal(false)
        fetchData()
      } else {
        alert('❌ Error: ' + error.message)
      }
    }
  }

  const handleImportExcel = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (event) => {
      const workbook = XLSX.read(event.target.result, { type: 'binary' })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json(sheet)

      if (jsonData.length === 0) {
        alert('❌ File Excel kosong')
        return
      }

      const tab = tabs.find(t => t.id === activeTab)
      const { error } = await supabase.from(tab.table).insert(jsonData)

      if (!error) {
        alert(`✅ Berhasil import ${jsonData.length} data`)
        fetchData()
      } else {
        alert('❌ Error import: ' + error.message)
      }
    }
    reader.readAsBinaryString(file)
    e.target.value = null
  }

  const handleExportExcel = () => {
    const tab = tabs.find(t => t.id === activeTab)
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, tab.label)
    XLSX.writeFile(wb, `${tab.label}_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const getEmptyForm = () => {
    switch (activeTab) {
      case 'blocks':
        return { kawasan: '', code: '', name: '', luas_total: '', kategori: 'PC', varietas: '', active: true }
      case 'materials':
        return { code: '', name: '', category: 'herbisida', unit: 'liter', manufacturer: '', description: '', active: true }
      case 'vendors':
        return { code: '', name: '', contact_person: '', phone: '', active: true }
      case 'workers':
        return { vendor_id: '', code: '', name: '', phone: '', active: true }
      case 'sections':
        return { code: '', name: '', description: '', active: true }
      case 'activities':
        return { code: '', name: '', description: '', requires_material: false, requires_vendor: true, active: true }
      case 'users':
        return { username: '', password: '', full_name: '', role: 'supervisor', section_id: null, vendor_id: null, active: true }
      default:
        return {}
    }
  }

  const renderForm = () => {
    switch (activeTab) {
      case 'blocks':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Kawasan *</label>
                <input type="text" value={formData.kawasan || ''} onChange={(e) => setFormData({...formData, kawasan: e.target.value})} className="w-full px-3 py-2 border rounded" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Code *</label>
                <input type="text" value={formData.code || ''} onChange={(e) => setFormData({...formData, code: e.target.value})} className="w-full px-3 py-2 border rounded" required />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Nama Blok *</label>
              <input type="text" value={formData.name || ''} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full px-3 py-2 border rounded" required />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Luas (Ha) *</label>
                <input type="number" step="0.01" value={formData.luas_total || ''} onChange={(e) => setFormData({...formData, luas_total: e.target.value})} className="w-full px-3 py-2 border rounded" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Kategori *</label>
                <select value={formData.kategori || 'PC'} onChange={(e) => setFormData({...formData, kategori: e.target.value})} className="w-full px-3 py-2 border rounded">
                  <option value="PC">Plant Cane</option>
                  <option value="RC">Ratoon Cane</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Varietas</label>
                <input type="text" value={formData.varietas || ''} onChange={(e) => setFormData({...formData, varietas: e.target.value})} className="w-full px-3 py-2 border rounded" />
              </div>
            </div>
          </div>
        )
      case 'materials':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Code *</label>
                <input type="text" value={formData.code || ''} onChange={(e) => setFormData({...formData, code: e.target.value})} className="w-full px-3 py-2 border rounded" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Nama Material *</label>
                <input type="text" value={formData.name || ''} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full px-3 py-2 border rounded" required />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Kategori *</label>
                <select value={formData.category || 'herbisida'} onChange={(e) => setFormData({...formData, category: e.target.value})} className="w-full px-3 py-2 border rounded">
                  <option value="herbisida">Herbisida</option>
                  <option value="pestisida">Pestisida</option>
                  <option value="pupuk">Pupuk</option>
                  <option value="insektisida">Insektisida</option>
                  <option value="alat">Alat</option>
                  <option value="lainnya">Lainnya</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Unit *</label>
                <select value={formData.unit || 'liter'} onChange={(e) => setFormData({...formData, unit: e.target.value})} className="w-full px-3 py-2 border rounded">
                  <option value="liter">Liter</option>
                  <option value="kg">Kg</option>
                  <option value="gram">Gram</option>
                  <option value="botol">Botol</option>
                  <option value="karung">Karung</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Manufacturer</label>
                <input type="text" value={formData.manufacturer || ''} onChange={(e) => setFormData({...formData, manufacturer: e.target.value})} className="w-full px-3 py-2 border rounded" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Deskripsi</label>
              <textarea value={formData.description || ''} onChange={(e) => setFormData({...formData, description: e.target.value})} className="w-full px-3 py-2 border rounded" rows={3} />
            </div>
          </div>
        )
      case 'vendors':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Code *</label>
                <input type="text" value={formData.code || ''} onChange={(e) => setFormData({...formData, code: e.target.value})} className="w-full px-3 py-2 border rounded" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Nama Vendor *</label>
                <input type="text" value={formData.name || ''} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full px-3 py-2 border rounded" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Contact Person</label>
                <input type="text" value={formData.contact_person || ''} onChange={(e) => setFormData({...formData, contact_person: e.target.value})} className="w-full px-3 py-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Phone</label>
                <input type="text" value={formData.phone || ''} onChange={(e) => setFormData({...formData, phone: e.target.value})} className="w-full px-3 py-2 border rounded" />
              </div>
            </div>
          </div>
        )
      case 'workers':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Vendor *</label>
              <select value={formData.vendor_id || ''} onChange={(e) => setFormData({...formData, vendor_id: e.target.value})} className="w-full px-3 py-2 border rounded" required>
                <option value="">Pilih Vendor</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Code *</label>
                <input type="text" value={formData.code || ''} onChange={(e) => setFormData({...formData, code: e.target.value})} className="w-full px-3 py-2 border rounded" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Nama Worker *</label>
                <input type="text" value={formData.name || ''} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full px-3 py-2 border rounded" required />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone</label>
              <input type="text" value={formData.phone || ''} onChange={(e) => setFormData({...formData, phone: e.target.value})} className="w-full px-3 py-2 border rounded" />
            </div>
          </div>
        )
      case 'sections':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Code *</label>
                <input type="text" value={formData.code || ''} onChange={(e) => setFormData({...formData, code: e.target.value})} className="w-full px-3 py-2 border rounded" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Nama Section *</label>
                <input type="text" value={formData.name || ''} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full px-3 py-2 border rounded" required />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea value={formData.description || ''} onChange={(e) => setFormData({...formData, description: e.target.value})} className="w-full px-3 py-2 border rounded" rows={3} />
            </div>
          </div>
        )
      case 'activities':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Code *</label>
                <input type="text" value={formData.code || ''} onChange={(e) => setFormData({...formData, code: e.target.value})} className="w-full px-3 py-2 border rounded" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Nama Activity *</label>
                <input type="text" value={formData.name || ''} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full px-3 py-2 border rounded" required />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea value={formData.description || ''} onChange={(e) => setFormData({...formData, description: e.target.value})} className="w-full px-3 py-2 border rounded" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center">
                <input type="checkbox" checked={formData.requires_material || false} onChange={(e) => setFormData({...formData, requires_material: e.target.checked})} className="w-4 h-4 mr-2" />
                <label className="text-sm">Requires Material</label>
              </div>
              <div className="flex items-center">
                <input type="checkbox" checked={formData.requires_vendor || false} onChange={(e) => setFormData({...formData, requires_vendor: e.target.checked})} className="w-4 h-4 mr-2" />
                <label className="text-sm">Requires Vendor</label>
              </div>
            </div>
          </div>
        )
      case 'users':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Username *</label>
                <input type="text" value={formData.username || ''} onChange={(e) => setFormData({...formData, username: e.target.value})} className="w-full px-3 py-2 border rounded" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Password *</label>
                <input type="password" value={formData.password || ''} onChange={(e) => setFormData({...formData, password: e.target.value})} className="w-full px-3 py-2 border rounded" required />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Full Name *</label>
              <input type="text" value={formData.full_name || ''} onChange={(e) => setFormData({...formData, full_name: e.target.value})} className="w-full px-3 py-2 border rounded" required />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Role *</label>
                <select value={formData.role || 'supervisor'} onChange={(e) => setFormData({...formData, role: e.target.value})} className="w-full px-3 py-2 border rounded">
                  <option value="admin">Admin</option>
                  <option value="section_head">Section Head</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="vendor">Vendor</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Section</label>
                <select value={formData.section_id || ''} onChange={(e) => setFormData({...formData, section_id: e.target.value || null})} className="w-full px-3 py-2 border rounded">
                  <option value="">None</option>
                  {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Vendor</label>
                <select value={formData.vendor_id || ''} onChange={(e) => setFormData({...formData, vendor_id: e.target.value || null})} className="w-full px-3 py-2 border rounded">
                  <option value="">None</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
            </div>
          </div>
        )
      default:
        return <div className="text-gray-600">Form untuk {activeTab}</div>
    }
  }

  const renderTable = () => {
    if (loading) return <div className="text-center py-8">Loading...</div>
    if (data.length === 0) return <div className="text-center py-8 text-gray-500">Tidak ada data</div>

    switch (activeTab) {
      case 'blocks':
        return (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kawasan</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nama</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Luas (Ha)</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kategori</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Varietas</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.map(item => (
                <tr key={item.id}>
                  <td className="px-4 py-3 text-sm">{item.kawasan}</td>
                  <td className="px-4 py-3 text-sm font-medium">{item.code}</td>
                  <td className="px-4 py-3 text-sm">{item.name}</td>
                  <td className="px-4 py-3 text-sm">{item.luas_total}</td>
                  <td className="px-4 py-3 text-sm"><span className={`px-2 py-1 rounded text-xs ${item.kategori === 'PC' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>{item.kategori}</span></td>
                  <td className="px-4 py-3 text-sm">{item.varietas}</td>
                  <td className="px-4 py-3 text-sm">
                    <button onClick={() => handleEdit(item)} className="text-blue-600 hover:text-blue-800 mr-3">Edit</button>
                    <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:text-red-800">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      case 'materials':
        return (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nama</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kategori</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Manufacturer</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.map(item => (
                <tr key={item.id}>
                  <td className="px-4 py-3 text-sm font-medium">{item.code}</td>
                  <td className="px-4 py-3 text-sm">{item.name}</td>
                  <td className="px-4 py-3 text-sm"><span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs">{item.category}</span></td>
                  <td className="px-4 py-3 text-sm">{item.unit}</td>
                  <td className="px-4 py-3 text-sm">{item.manufacturer}</td>
                  <td className="px-4 py-3 text-sm">
                    <button onClick={() => handleEdit(item)} className="text-blue-600 hover:text-blue-800 mr-3">Edit</button>
                    <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:text-red-800">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      case 'vendors':
        return (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nama</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.map(item => (
                <tr key={item.id}>
                  <td className="px-4 py-3 text-sm font-medium">{item.code}</td>
                  <td className="px-4 py-3 text-sm">{item.name}</td>
                  <td className="px-4 py-3 text-sm">{item.contact_person}</td>
                  <td className="px-4 py-3 text-sm">{item.phone}</td>
                  <td className="px-4 py-3 text-sm">
                    <button onClick={() => handleEdit(item)} className="text-blue-600 hover:text-blue-800 mr-3">Edit</button>
                    <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:text-red-800">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      case 'workers':
        return (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nama</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.map(item => (
                <tr key={item.id}>
                  <td className="px-4 py-3 text-sm">{item.vendors?.name}</td>
                  <td className="px-4 py-3 text-sm font-medium">{item.code}</td>
                  <td className="px-4 py-3 text-sm">{item.name}</td>
                  <td className="px-4 py-3 text-sm">{item.phone}</td>
                  <td className="px-4 py-3 text-sm">
                    <button onClick={() => handleEdit(item)} className="text-blue-600 hover:text-blue-800 mr-3">Edit</button>
                    <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:text-red-800">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      case 'sections':
        return (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nama</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.map(item => (
                <tr key={item.id}>
                  <td className="px-4 py-3 text-sm font-medium">{item.code}</td>
                  <td className="px-4 py-3 text-sm">{item.name}</td>
                  <td className="px-4 py-3 text-sm">{item.description}</td>
                  <td className="px-4 py-3 text-sm">
                    <button onClick={() => handleEdit(item)} className="text-blue-600 hover:text-blue-800 mr-3">Edit</button>
                    <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:text-red-800">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      case 'activities':
        return (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nama</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.map(item => (
                <tr key={item.id}>
                  <td className="px-4 py-3 text-sm font-medium">{item.code}</td>
                  <td className="px-4 py-3 text-sm">{item.name}</td>
                  <td className="px-4 py-3 text-sm">{item.requires_material ? '✅' : '❌'}</td>
                  <td className="px-4 py-3 text-sm">{item.requires_vendor ? '✅' : '❌'}</td>
                  <td className="px-4 py-3 text-sm">
                    <button onClick={() => handleEdit(item)} className="text-blue-600 hover:text-blue-800 mr-3">Edit</button>
                    <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:text-red-800">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      case 'users':
        return (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Username</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Full Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Section</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.map(item => (
                <tr key={item.id}>
                  <td className="px-4 py-3 text-sm font-medium">{item.username}</td>
                  <td className="px-4 py-3 text-sm">{item.full_name}</td>
                  <td className="px-4 py-3 text-sm"><span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">{item.role}</span></td>
                  <td className="px-4 py-3 text-sm">{item.sections?.name || '-'}</td>
                  <td className="px-4 py-3 text-sm">{item.vendors?.name || '-'}</td>
                  <td className="px-4 py-3 text-sm">
                    <button onClick={() => handleEdit(item)} className="text-blue-600 hover:text-blue-800 mr-3">Edit</button>
                    <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:text-red-800">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      default:
        return <div className="text-center py-8 text-gray-500">Table {activeTab}</div>
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Master Data Management</h1>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="border-b">
          <div className="flex space-x-1 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap ${activeTab === tab.id ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <div className="flex gap-2">
              <button onClick={handleNew} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">+ Tambah</button>
              <label className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 cursor-pointer">
                📥 Import Excel
                <input type="file" accept=".xlsx,.xls" onChange={handleImportExcel} className="hidden" />
              </label>
              <button onClick={handleExportExcel} className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700">📤 Export Excel</button>
            </div>
            <div className="text-sm text-gray-600">Total: {data.length} data</div>
          </div>

          <div className="overflow-x-auto">
            {renderTable()}
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">{editData ? 'Edit' : 'Tambah'} {tabs.find(t => t.id === activeTab)?.label}</h2>
            {renderForm()}
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border rounded hover:bg-gray-50">Batal</button>
              <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
