import { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabase'

export default function TransactionInput({ user }) {
  const [step, setStep] = useState(1) // 1: Select Work Plan, 2: Input Transaction
  const [workPlans, setWorkPlans] = useState([])
  const [selectedWorkPlan, setSelectedWorkPlan] = useState(null)
  const [blockActivities, setBlockActivities] = useState([])
  const [plannedMaterials, setPlannedMaterials] = useState([])
  
  const [formData, setFormData] = useState({
    transaction_date: new Date().toISOString().split('T')[0],
    block_activity_id: '',
    luas_dikerjakan: '',
    kondisi: '',
    catatan: ''
  })
  
  const [vendors, setVendors] = useState([])
  const [workers, setWorkers] = useState([])
  const [selectedWorkers, setSelectedWorkers] = useState([])
  const [materialInputs, setMaterialInputs] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchWorkPlans()
  }, [user])

  useEffect(() => {
    if (selectedWorkPlan) {
      fetchWorkPlanDetails()
    }
  }, [selectedWorkPlan])

  useEffect(() => {
    if (selectedWorkPlan?.vendor_id) {
      fetchWorkersByVendor(selectedWorkPlan.vendor_id)
    }
  }, [selectedWorkPlan])

  const fetchWorkPlans = async () => {
    setLoading(true)
    
    // Ambil work plans yang sudah approved atau in_progress
    let query = supabase
      .from('activity_plans')
      .select(`
        *,
        sections(name),
        activity_types(name),
        vendors(name),
        activity_stages(name)
      `)
      .in('status', ['approved', 'in_progress'])
      .order('target_bulan', { ascending: false })

    // Filter by section jika user punya section
    if (user.section_id) {
      query = query.eq('section_id', user.section_id)
    }

    // Filter by vendor jika user adalah vendor
    if (user.role === 'vendor' && user.vendor_id) {
      query = query.eq('vendor_id', user.vendor_id)
    }

    const { data, error } = await query

    if (!error) {
      setWorkPlans(data || [])
    }
    setLoading(false)
  }

  const fetchWorkPlanDetails = async () => {
    if (!selectedWorkPlan) return

    // Fetch block activities yang belum completed
    const { data: blocks } = await supabase
      .from('block_activities')
      .select('*, blocks(kawasan, code, name, kategori, luas_total)')
      .eq('activity_plan_id', selectedWorkPlan.id)
      .neq('status', 'completed')
      .order('created_at')

    setBlockActivities(blocks || [])

    // Fetch planned materials
    const { data: materials } = await supabase
      .from('planned_materials')
      .select('*, materials(code, name)')
      .eq('activity_plan_id', selectedWorkPlan.id)

    setPlannedMaterials(materials || [])
  }

  const fetchWorkersByVendor = async (vendorId) => {
    const { data } = await supabase
      .from('workers')
      .select('*')
      .eq('vendor_id', vendorId)
      .eq('active', true)
    setWorkers(data || [])
  }

  const handleSelectWorkPlan = (plan) => {
    setSelectedWorkPlan(plan)
    setStep(2)
  }

  const handleBlockActivityChange = (blockActivityId) => {
    setFormData({ ...formData, block_activity_id: blockActivityId })
    
    const blockActivity = blockActivities.find(ba => ba.id === blockActivityId)
    if (blockActivity) {
      // Auto-fill luas dengan remaining
      setFormData(prev => ({ 
        ...prev, 
        block_activity_id: blockActivityId,
        luas_dikerjakan: blockActivity.luas_remaining 
      }))
      
      // Initialize material inputs dari planned materials dengan auto-calculate
      if (plannedMaterials.length > 0) {
        const luasDikerjakan = blockActivity.luas_remaining
        const materialsWithDosis = plannedMaterials.map(pm => {
          // Calculate dosis berdasarkan ratio luas
          const dosisPerHa = parseFloat(pm.total_quantity) / parseFloat(blockActivity.luas_total)
          const quantityUsed = dosisPerHa * parseFloat(luasDikerjakan)
          
          return {
            material_id: pm.material_id,
            material_code: pm.materials.code,
            material_name: pm.materials.name,
            planned_total: pm.total_quantity,
            remaining: pm.remaining_quantity,
            quantity_used: quantityUsed.toFixed(3), // AUTO CALCULATED!
            unit: pm.unit
          }
        })
        setMaterialInputs(materialsWithDosis)
      }
    }
  }

  const handleLuasChange = (luas) => {
    setFormData({ ...formData, luas_dikerjakan: luas })
    
    // Recalculate materials berdasarkan luas baru
    if (formData.block_activity_id && plannedMaterials.length > 0) {
      const blockActivity = blockActivities.find(ba => ba.id === formData.block_activity_id)
      if (blockActivity) {
        const materialsWithDosis = plannedMaterials.map(pm => {
          const dosisPerHa = parseFloat(pm.total_quantity) / parseFloat(blockActivity.luas_total)
          const quantityUsed = dosisPerHa * parseFloat(luas || 0)
          
          return {
            material_id: pm.material_id,
            material_code: pm.materials.code,
            material_name: pm.materials.name,
            planned_total: pm.total_quantity,
            remaining: pm.remaining_quantity,
            quantity_used: quantityUsed.toFixed(3), // AUTO RECALCULATED!
            unit: pm.unit
          }
        })
        setMaterialInputs(materialsWithDosis)
      }
    }
  }

  const handleMaterialChange = (index, value) => {
    setMaterialInputs(prev => {
      const updated = [...prev]
      updated[index].quantity_used = value
      return updated
    })
  }

  const handleWorkerToggle = (workerId) => {
    setSelectedWorkers(prev => 
      prev.includes(workerId) 
        ? prev.filter(id => id !== workerId)
        : [...prev, workerId]
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Validasi
      if (!formData.block_activity_id || !formData.luas_dikerjakan) {
        alert('❌ Mohon lengkapi field wajib')
        setLoading(false)
        return
      }

      if (selectedWorkers.length === 0) {
        alert('❌ Minimal pilih 1 pekerja')
        setLoading(false)
        return
      }

      const blockActivity = blockActivities.find(ba => ba.id === formData.block_activity_id)
      if (parseFloat(formData.luas_dikerjakan) > parseFloat(blockActivity.luas_remaining)) {
        alert('❌ Luas dikerjakan tidak boleh melebihi luas remaining')
        setLoading(false)
        return
      }

      // 1. Insert transaction
      const { data: transaction, error: txError } = await supabase
        .from('transactions')
        .insert({
          block_activity_id: formData.block_activity_id,
          tanggal: formData.transaction_date,
          luas_dikerjakan: parseFloat(formData.luas_dikerjakan),
          jumlah_pekerja: selectedWorkers.length,
          kondisi: formData.kondisi || null,
          catatan: formData.catatan || null,
          created_by: user.id
        })
        .select()
        .single()

      if (txError) throw txError

      // 2. Insert workers
      const workerData = selectedWorkers.map(workerId => ({
        transaction_id: transaction.id,
        worker_id: workerId,
        jumlah_manual: null
      }))

      const { error: workerError } = await supabase
        .from('transaction_workers')
        .insert(workerData)

      if (workerError) throw workerError

      // 3. Insert materials
      const materialsToInsert = materialInputs
        .filter(m => m.quantity_used && parseFloat(m.quantity_used) > 0)
        .map(m => ({
          transaction_id: transaction.id,
          material_id: m.material_id,
          quantity_used: parseFloat(m.quantity_used),
          unit: m.unit,
          notes: null
        }))

      if (materialsToInsert.length > 0) {
        const { error: matError } = await supabase
          .from('transaction_materials')
          .insert(materialsToInsert)

        if (matError) throw matError
      }

      alert('✅ Transaksi berhasil disimpan!')
      
      // Reset
      setStep(1)
      setSelectedWorkPlan(null)
      setFormData({
        transaction_date: new Date().toISOString().split('T')[0],
        block_activity_id: '',
        luas_dikerjakan: '',
        kondisi: '',
        catatan: ''
      })
      setSelectedWorkers([])
      setMaterialInputs([])
      fetchWorkPlans()

    } catch (error) {
      console.error('Error:', error)
      alert('❌ Error: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  // ========== STEP 1: SELECT WORK PLAN ==========
  if (step === 1) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Input Transaksi dari Work Plan</h1>

        <div className="bg-blue-50 border-l-4 border-blue-500 p-4">
          <p className="text-sm text-blue-800">
            📋 <strong>Alur Baru:</strong> Pilih Work Plan yang sudah approved, lalu sistem akan otomatis load data (Section, Activity, Block, Material)
          </p>
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b">
            <h3 className="font-semibold">Work Plans Available</h3>
            <div className="text-sm text-gray-600">Total: {workPlans.length} work plans</div>
          </div>
          
          <div className="overflow-x-auto">
            {loading ? (
              <div className="text-center py-8">Loading...</div>
            ) : workPlans.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Tidak ada work plan yang approved/in progress
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bulan</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Section</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Activity</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stage</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {workPlans.map(plan => (
                    <tr key={plan.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm">
                        {new Date(plan.target_bulan).toLocaleDateString('id-ID', { year: 'numeric', month: 'long' })}
                      </td>
                      <td className="px-4 py-3 text-sm">{plan.sections?.name}</td>
                      <td className="px-4 py-3 text-sm">{plan.activity_types?.name}</td>
                      <td className="px-4 py-3 text-sm">{plan.vendors?.name || '-'}</td>
                      <td className="px-4 py-3 text-sm">{plan.activity_stages?.name || '-'}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-1 rounded text-xs ${
                          plan.status === 'approved' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {plan.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <button
                          onClick={() => handleSelectWorkPlan(plan)}
                          className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                        >
                          Pilih & Input Transaksi →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ========== STEP 2: INPUT TRANSACTION ==========
  if (step === 2 && selectedWorkPlan) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Input Transaksi</h1>
          <button
            onClick={() => {
              setStep(1)
              setSelectedWorkPlan(null)
            }}
            className="px-4 py-2 border rounded hover:bg-gray-50"
          >
            ← Kembali ke Daftar Work Plan
          </button>
        </div>

        {/* Work Plan Info */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">📋 Work Plan Selected</h3>
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Section:</span>
              <div className="font-medium">{selectedWorkPlan.sections?.name}</div>
            </div>
            <div>
              <span className="text-gray-600">Activity:</span>
              <div className="font-medium">{selectedWorkPlan.activity_types?.name}</div>
            </div>
            <div>
              <span className="text-gray-600">Vendor:</span>
              <div className="font-medium">{selectedWorkPlan.vendors?.name || '-'}</div>
            </div>
            <div>
              <span className="text-gray-600">Stage:</span>
              <div className="font-medium">{selectedWorkPlan.activity_stages?.name || '-'}</div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6">
          {/* Tanggal & Block */}
          <div className="grid grid-cols-2 gap-4">
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
              <label className="block text-sm font-medium mb-1">Pilih Block *</label>
              <select
                value={formData.block_activity_id}
                onChange={(e) => handleBlockActivityChange(e.target.value)}
                className="w-full px-3 py-2 border rounded"
                required
              >
                <option value="">Pilih Block</option>
                {blockActivities.map(ba => (
                  <option key={ba.id} value={ba.id}>
                    {ba.blocks?.kawasan} - {ba.blocks?.code} ({ba.blocks?.name}) | 
                    Remaining: {ba.luas_remaining} Ha dari {ba.luas_total} Ha
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Luas & Kondisi */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Luas Dikerjakan (Ha) *</label>
              <input
                type="number"
                step="0.01"
                value={formData.luas_dikerjakan}
                onChange={(e) => handleLuasChange(e.target.value)}
                className="w-full px-3 py-2 border rounded"
                required
              />
              {formData.block_activity_id && (
                <p className="text-xs text-gray-600 mt-1">
                  Max: {blockActivities.find(ba => ba.id === formData.block_activity_id)?.luas_remaining} Ha
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Kondisi</label>
              <input
                type="text"
                value={formData.kondisi}
                onChange={(e) => setFormData({...formData, kondisi: e.target.value})}
                placeholder="Normal, Hujan, dll"
                className="w-full px-3 py-2 border rounded"
              />
            </div>
          </div>

          {/* Workers */}
          {workers.length > 0 && (
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

          {/* Materials (Auto from Work Plan) */}
          {materialInputs.length > 0 && (
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-3">Material yang Digunakan (Auto-Calculated)</h3>
              <div className="bg-green-50 border-l-4 border-green-500 p-3 mb-3">
                <p className="text-sm text-green-800">
                  ✅ Material sudah dihitung otomatis berdasarkan: <strong>Dosis × Luas Dikerjakan</strong>
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Material</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Planned Total</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Remaining</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Quantity Used (Auto)</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Unit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {materialInputs.map((mat, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2 text-sm">{mat.material_code} - {mat.material_name}</td>
                        <td className="px-3 py-2 text-sm">{mat.planned_total}</td>
                        <td className="px-3 py-2 text-sm">{mat.remaining}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="0.001"
                            value={mat.quantity_used}
                            onChange={(e) => handleMaterialChange(idx, e.target.value)}
                            className="w-24 px-2 py-1 border rounded text-sm bg-yellow-50 font-semibold"
                            title="Bisa diedit manual"
                          />
                        </td>
                        <td className="px-3 py-2 text-sm">{mat.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Catatan */}
          <div>
            <label className="block text-sm font-medium mb-1">Catatan</label>
            <textarea
              value={formData.catatan}
              onChange={(e) => setFormData({...formData, catatan: e.target.value})}
              className="w-full px-3 py-2 border rounded"
              rows="3"
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setStep(1)
                setSelectedWorkPlan(null)
              }}
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

  return null
}
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
return null
}