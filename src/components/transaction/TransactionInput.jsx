import { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabase'

export default function TransactionInput({ user }) {
  const [formData, setFormData] = useState({
    transaction_date: new Date().toISOString().split('T')[0],
    vendor_id: '',
    section_id: '',
    activity_type_id: '',
    block_id: '',
    luas_kerja: '',
    worker_count: '',
    notes: ''
  })
  const [vendors, setVendors] = useState([])
  const [sections, setSections] = useState([])
  const [activities, setActivities] = useState([])
  const [blocks, setBlocks] = useState([])
  const [workers, setWorkers] = useState([])
  const [selectedWorkers, setSelectedWorkers] = useState([])
  const [materials, setMaterials] = useState([])
  const [materialInputs, setMaterialInputs] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchMasterData()
    // Auto-fill vendor jika user adalah vendor
    if (user.role === 'vendor' && user.vendor_id) {
      setFormData(prev => ({ ...prev, vendor_id: user.vendor_id }))
    }
    // Auto-fill section jika user memiliki section
    if (user.section_id) {
      setFormData(prev => ({ ...prev, section_id: user.section_id }))
    }
  }, [user])

  useEffect(() => {
    if (formData.vendor_id) {
      fetchWorkersByVendor(formData.vendor_id)
    }
  }, [formData.vendor_id])

  useEffect(() => {
    if (formData.vendor_id && formData.section_id && formData.activity_type_id) {
      checkVendorAssignment()
    }
  }, [formData.vendor_id, formData.section_id, formData.activity_type_id])

  useEffect(() => {
    if (formData.activity_type_id && formData.block_id) {
      fetchActivityMaterials()
    }
  }, [formData.activity_type_id, formData.block_id])

  const fetchMasterData = async () => {
    const [v, s, a, b] = await Promise.all([
      supabase.from('vendors').select('*').eq('active', true),
      supabase.from('sections').select('*').eq('active', true),
      supabase.from('activity_types').select('*').eq('active', true),
      supabase.from('blocks').select('*').eq('active', true)
    ])
    setVendors(v.data || [])
    setSections(s.data || [])
    setActivities(a.data || [])
    setBlocks(b.data || [])
  }

  const fetchWorkersByVendor = async (vendorId) => {
    const { data } = await supabase
      .from('workers')
      .select('*')
      .eq('vendor_id', vendorId)
      .eq('active', true)
    setWorkers(data || [])
  }

  const checkVendorAssignment = async () => {
    const { data } = await supabase
      .from('vendor_assignments')
      .select('*')
      .eq('vendor_id', formData.vendor_id)
      .eq('section_id', formData.section_id)
      .eq('activity_type_id', formData.activity_type_id)
      .single()

    if (!data) {
      alert('⚠️ Warning: Vendor tidak ter-assign untuk kombinasi Section & Activity ini')
    }
  }

  const fetchActivityMaterials = async () => {
    const block = blocks.find(b => b.id === formData.block_id)
    if (!block) return

    const { data } = await supabase
      .from('activity_materials')
      .select('*, materials(*), activity_stages(*)')
      .eq('activity_type_id', formData.activity_type_id)
      .or(`tanaman_kategori.is.null,tanaman_kategori.eq.${block.kategori}`)

    if (data && data.length > 0) {
      setMaterials(data)
      // Initialize material inputs dengan nilai default
      const initialInputs = data.map(mat => ({
        material_id: mat.material_id,
        material_code: mat.materials.code,
        material_name: mat.materials.name,
        stage_id: mat.stage_id,
        stage_name: mat.activity_stages?.name || 'General',
        alternative_option: mat.alternative_option || 'Normal A',
        dosis_used: mat.default_dosis || 0,
        unit: mat.unit,
        required: mat.required
      }))
      setMaterialInputs(initialInputs)
    } else {
      setMaterials([])
      setMaterialInputs([])
    }
  }

  const handleWorkerToggle = (workerId) => {
    setSelectedWorkers(prev => 
      prev.includes(workerId) 
        ? prev.filter(id => id !== workerId)
        : [...prev, workerId]
    )
  }

  const handleMaterialChange = (index, field, value) => {
    setMaterialInputs(prev => {
      const updated = [...prev]
      updated[index][field] = value
      return updated
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Validasi
      if (!formData.vendor_id || !formData.section_id || !formData.activity_type_id || !formData.block_id) {
        alert('❌ Mohon lengkapi semua field wajib')
        setLoading(false)
        return
      }

      if (selectedWorkers.length === 0) {
        alert('❌ Minimal pilih 1 pekerja')
        setLoading(false)
        return
      }

      // Check materials required
      const requiredMaterials = materialInputs.filter(m => m.required)
      const missingMaterials = requiredMaterials.filter(m => !m.dosis_used || m.dosis_used <= 0)
      if (missingMaterials.length > 0) {
        alert('❌ Material wajib harus diisi: ' + missingMaterials.map(m => m.material_name).join(', '))
        setLoading(false)
        return
      }

      // 1. Insert transaction header
      const { data: transaction, error: txError } = await supabase
        .from('transactions')
        .insert({
          transaction_date: formData.transaction_date,
          vendor_id: formData.vendor_id,
          section_id: formData.section_id,
          activity_type_id: formData.activity_type_id,
          block_id: formData.block_id,
          luas_kerja: parseFloat(formData.luas_kerja) || 0,
          worker_count: selectedWorkers.length,
          notes: formData.notes || null,
          created_by: user.id,
          status: 'draft'
        })
        .select()
        .single()

      if (txError) throw txError

      // 2. Insert workers
      const workerData = selectedWorkers.map(workerId => ({
        transaction_id: transaction.id,
        worker_id: workerId
      }))

      const { error: workerError } = await supabase
        .from('transaction_workers')
        .insert(workerData)

      if (workerError) throw workerError

      // 3. Insert materials (hanya yang diisi)
      const materialsToInsert = materialInputs
        .filter(m => m.dosis_used && parseFloat(m.dosis_used) > 0)
        .map(m => ({
          transaction_id: transaction.id,
          material_id: m.material_id,
          stage_id: m.stage_id,
          alternative_option: m.alternative_option,
          dosis_used: parseFloat(m.dosis_used),
          unit: m.unit
        }))

      if (materialsToInsert.length > 0) {
        const { error: matError } = await supabase
          .from('transaction_materials')
          .insert(materialsToInsert)

        if (matError) throw matError
      }

      alert('✅ Transaksi berhasil disimpan!')
      
      // Reset form
      setFormData({
        transaction_date: new Date().toISOString().split('T')[0],
        vendor_id: user.role === 'vendor' ? user.vendor_id : '',
        section_id: user.section_id || '',
        activity_type_id: '',
        block_id: '',
        luas_kerja: '',
        worker_count: '',
        notes: ''
      })
      setSelectedWorkers([])
      setMaterialInputs([])
      setMaterials([])

    } catch (error) {
      console.error('Error:', error)
      alert('❌ Error: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Input Transaksi Harian</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6">
        {/* Header Info */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Tanggal *</label>
            <input
              type="date"
              value={formData.transaction_date}
              onChange={(e) => setFormData({...formData, transaction_date: e.target.value})}
              className="w-full px-3 py-2 border rounded"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Vendor *</label>
            <select
              value={formData.vendor_id}
              onChange={(e) => setFormData({...formData, vendor_id: e.target.value})}
              className="w-full px-3 py-2 border rounded"
              disabled={user.role === 'vendor'}
              required
            >
              <option value="">Pilih Vendor</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Section *</label>
            <select
              value={formData.section_id}
              onChange={(e) => setFormData({...formData, section_id: e.target.value})}
              className="w-full px-3 py-2 border rounded"
              required
            >
              <option value="">Pilih Section</option>
              {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        {/* Activity & Block */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Activity *</label>
            <select
              value={formData.activity_type_id}
              onChange={(e) => setFormData({...formData, activity_type_id: e.target.value})}
              className="w-full px-3 py-2 border rounded"
              required
            >
              <option value="">Pilih Activity</option>
              {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Block *</label>
            <select
              value={formData.block_id}
              onChange={(e) => setFormData({...formData, block_id: e.target.value})}
              className="w-full px-3 py-2 border rounded"
              required
            >
              <option value="">Pilih Block</option>
              {blocks.map(b => (
                <option key={b.id} value={b.id}>
                  {b.kawasan} - {b.code} ({b.name}) - {b.kategori}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Luas Kerja */}
        <div>
          <label className="block text-sm font-medium mb-1">Luas Kerja (Ha)</label>
          <input
            type="number"
            step="0.01"
            value={formData.luas_kerja}
            onChange={(e) => setFormData({...formData, luas_kerja: e.target.value})}
            className="w-full px-3 py-2 border rounded"
          />
        </div>

        {/* Worker Selection */}
        {formData.vendor_id && (
          <div className="border-t pt-4">
            <h3 className="font-semibold mb-3">Pilih Pekerja *</h3>
            <div className="grid grid-cols-3 gap-2 max-h-60 overflow-y-auto">
              {workers.map(worker => (
                <label key={worker.id} className="flex items-center p-2 border rounded hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedWorkers.includes(worker.id)}
                    onChange={() => handleWorkerToggle(worker.id)}
                    className="mr-2"
                  />
                  <span className="text-sm">{worker.code} - {worker.name}</span>
                </label>
              ))}
            </div>
            <div className="mt-2 text-sm text-gray-600">
              {selectedWorkers.length} pekerja dipilih
            </div>
          </div>
        )}

        {/* Materials */}
        {materials.length > 0 && (
          <div className="border-t pt-4">
            <h3 className="font-semibold mb-3">Material yang Digunakan</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Material</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Stage</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Alternative</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Dosis</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Unit</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Required</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {materialInputs.map((mat, idx) => (
                    <tr key={idx}>
                      <td className="px-3 py-2 text-sm">{mat.material_code} - {mat.material_name}</td>
                      <td className="px-3 py-2 text-sm">{mat.stage_name}</td>
                      <td className="px-3 py-2 text-sm">{mat.alternative_option}</td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.001"
                          value={mat.dosis_used}
                          onChange={(e) => handleMaterialChange(idx, 'dosis_used', e.target.value)}
                          className="w-24 px-2 py-1 border rounded text-sm"
                        />
                      </td>
                      <td className="px-3 py-2 text-sm">{mat.unit}</td>
                      <td className="px-3 py-2 text-sm">
                        {mat.required && <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded">Wajib</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium mb-1">Catatan</label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({...formData, notes: e.target.value})}
            className="w-full px-3 py-2 border rounded"
            rows="3"
          />
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="px-4 py-2 border rounded hover:bg-gray-50"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? 'Menyimpan...' : 'Simpan Transaksi'}
          </button>
        </div>
      </form>
    </div>
  )
}