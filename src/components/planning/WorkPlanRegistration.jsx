import { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabase'

export default function WorkPlanRegistration({ user }) {
  const [activeView, setActiveView] = useState('list') // list | create | detail
  const [workPlans, setWorkPlans] = useState([])
  const [loading, setLoading] = useState(false)
  
  // Master Data
  const [sections, setSections] = useState([])
  const [activities, setActivities] = useState([])
  const [vendors, setVendors] = useState([])
  const [blocks, setBlocks] = useState([])
  const [stages, setStages] = useState([])
  const [materials, setMaterials] = useState([])
  
  // Form Data
  const [formData, setFormData] = useState({
    section_id: user.section_id || '',
    activity_type_id: '',
    vendor_id: '',
    target_bulan: new Date().toISOString().slice(0, 7), // YYYY-MM
    stage_id: '',
    alternative_option: ''
  })
  
  const [selectedBlocks, setSelectedBlocks] = useState([]) // { block_id, luas_total }
  const [selectedMaterials, setSelectedMaterials] = useState([]) // { material_id, total_quantity, unit }
  
  // Filter
  const [filters, setFilters] = useState({
    section_id: user.section_id || '',
    target_bulan: new Date().toISOString().slice(0, 7),
    status: ''
  })
  
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [planDetails, setPlanDetails] = useState(null)

  useEffect(() => {
    fetchMasterData()
    fetchWorkPlans()
  }, [])

  useEffect(() => {
    if (formData.activity_type_id) {
      fetchActivityMaterials()
    }
  }, [formData.activity_type_id])

  const fetchMasterData = async () => {
    const [s, a, v, b, st] = await Promise.all([
      supabase.from('sections').select('*').eq('active', true),
      supabase.from('activity_types').select('*').eq('active', true),
      supabase.from('vendors').select('*').eq('active', true),
      supabase.from('blocks').select('*').eq('active', true),
      supabase.from('activity_stages').select('*').eq('active', true).order('sequence_order')
    ])
    setSections(s.data || [])
    setActivities(a.data || [])
    setVendors(v.data || [])
    setBlocks(b.data || [])
    setStages(st.data || [])
  }

  const fetchActivityMaterials = async () => {
    const { data } = await supabase
      .from('activity_materials')
      .select('*, materials(*)')
      .eq('activity_type_id', formData.activity_type_id)
    
    if (data && data.length > 0) {
      const materialsList = data.map(am => ({
        material_id: am.material_id,
        material_code: am.materials.code,
        material_name: am.materials.name,
        default_dosis: am.default_dosis,
        unit: am.unit,
        required: am.required
      }))
      setMaterials(materialsList)
    } else {
      setMaterials([])
    }
  }

  const fetchWorkPlans = async () => {
    setLoading(true)
    
    const targetDate = `${filters.target_bulan}-01`
    
    let query = supabase
      .from('activity_plans')
      .select(`
        *,
        sections(name),
        activity_types(name),
        vendors(name),
        activity_stages(name),
        users!activity_plans_created_by_fkey(full_name)
      `)
      .gte('target_bulan', targetDate)
      .lt('target_bulan', new Date(new Date(targetDate).setMonth(new Date(targetDate).getMonth() + 1)).toISOString().split('T')[0])
      .order('created_at', { ascending: false })

    if (filters.section_id) query = query.eq('section_id', filters.section_id)
    if (filters.status) query = query.eq('status', filters.status)

    const { data, error } = await query

    if (!error) {
      setWorkPlans(data || [])
    }
    setLoading(false)
  }

  const handleBlockToggle = (block) => {
    const exists = selectedBlocks.find(b => b.block_id === block.id)
    if (exists) {
      setSelectedBlocks(selectedBlocks.filter(b => b.block_id !== block.id))
    } else {
      setSelectedBlocks([...selectedBlocks, {
        block_id: block.id,
        block_code: block.code,
        block_name: block.name,
        luas_total: block.luas_total
      }])
    }
  }

  const handleMaterialChange = (materialId, quantity) => {
    const existing = selectedMaterials.find(m => m.material_id === materialId)
    if (existing) {
      setSelectedMaterials(
        selectedMaterials.map(m =>
          m.material_id === materialId ? { ...m, total_quantity: quantity } : m
        )
      )
    } else {
      const material = materials.find(m => m.material_id === materialId)
      setSelectedMaterials([
        ...selectedMaterials,
        {
          material_id: materialId,
          total_quantity: quantity,
          unit: material.unit
        }
      ])
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Validasi
      if (!formData.section_id || !formData.activity_type_id || !formData.target_bulan) {
        alert('❌ Mohon lengkapi field wajib')
        setLoading(false)
        return
      }

      if (selectedBlocks.length === 0) {
        alert('❌ Minimal pilih 1 blok')
        setLoading(false)
        return
      }

      const targetDate = `${formData.target_bulan}-01`

      // 1. Insert activity plan
      const { data: plan, error: planError } = await supabase
        .from('activity_plans')
        .insert({
          section_id: formData.section_id,
          activity_type_id: formData.activity_type_id,
          vendor_id: formData.vendor_id || null,
          target_bulan: targetDate,
          stage_id: formData.stage_id || null,
          alternative_option: formData.alternative_option || null,
          status: 'draft',
          created_by: user.id
        })
        .select()
        .single()

      if (planError) throw planError

      // 2. Insert block activities
      const blockData = selectedBlocks.map(b => ({
        activity_plan_id: plan.id,
        block_id: b.block_id,
        luas_total: parseFloat(b.luas_total),
        status: 'planned'
      }))

      const { error: blockError } = await supabase
        .from('block_activities')
        .insert(blockData)

      if (blockError) throw blockError

      // 3. Insert planned materials
      if (selectedMaterials.length > 0) {
        const materialData = selectedMaterials
          .filter(m => m.total_quantity && parseFloat(m.total_quantity) > 0)
          .map(m => ({
            activity_plan_id: plan.id,
            material_id: m.material_id,
            total_quantity: parseFloat(m.total_quantity),
            allocated_quantity: 0,
            remaining_quantity: parseFloat(m.total_quantity),
            unit: m.unit
          }))

        if (materialData.length > 0) {
          const { error: matError } = await supabase
            .from('planned_materials')
            .insert(materialData)

          if (matError) throw matError
        }
      }

      alert('✅ Work Plan berhasil dibuat!')
      
      // Reset form
      setFormData({
        section_id: user.section_id || '',
        activity_type_id: '',
        vendor_id: '',
        target_bulan: new Date().toISOString().slice(0, 7),
        stage_id: '',
        alternative_option: ''
      })
      setSelectedBlocks([])
      setSelectedMaterials([])
      setActiveView('list')
      fetchWorkPlans()

    } catch (error) {
      console.error('Error:', error)
      alert('❌ Error: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchPlanDetails = async (planId) => {
    const [blocks, materials] = await Promise.all([
      supabase
        .from('block_activities')
        .select('*, blocks(kawasan, code, name, kategori)')
        .eq('activity_plan_id', planId),
      supabase
        .from('planned_materials')
        .select('*, materials(code, name)')
        .eq('activity_plan_id', planId)
    ])

    setPlanDetails({
      blocks: blocks.data || [],
      materials: materials.data || []
    })
  }

  const handleViewDetail = async (plan) => {
    setSelectedPlan(plan)
    await fetchPlanDetails(plan.id)
    setActiveView('detail')
  }

  const handleUpdateStatus = async (planId, newStatus) => {
    const { error } = await supabase
      .from('activity_plans')
      .update({ status: newStatus })
      .eq('id', planId)

    if (!error) {
      alert('✅ Status berhasil diupdate')
      fetchWorkPlans()
      if (activeView === 'detail') {
        const updatedPlan = workPlans.find(p => p.id === planId)
        if (updatedPlan) {
          setSelectedPlan({ ...updatedPlan, status: newStatus })
        }
      }
    } else {
      alert('❌ Error: ' + error.message)
    }
  }

  const handleDelete = async (planId) => {
    if (!confirm('Yakin hapus work plan ini? Semua detail blok dan material akan terhapus.')) return

    const { error } = await supabase
      .from('activity_plans')
      .delete()
      .eq('id', planId)

    if (!error) {
      alert('✅ Work Plan berhasil dihapus')
      fetchWorkPlans()
      if (activeView === 'detail') {
        setActiveView('list')
      }
    } else {
      alert('❌ Error: ' + error.message)
    }
  }

  const getStatusBadge = (status) => {
    const colors = {
      draft: 'bg-gray-100 text-gray-800',
      approved: 'bg-green-100 text-green-800',
      in_progress: 'bg-blue-100 text-blue-800',
      completed: 'bg-purple-100 text-purple-800',
      cancelled: 'bg-red-100 text-red-800'
    }
    return colors[status] || colors.draft
  }

  // ========== RENDER LIST VIEW ==========
  if (activeView === 'list') {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Work Plan Registration</h1>
          <button
            onClick={() => setActiveView('create')}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            + Buat Work Plan
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold mb-3">Filter</h3>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Bulan Target</label>
              <input
                type="month"
                value={filters.target_bulan}
                onChange={(e) => setFilters({ ...filters, target_bulan: e.target.value })}
                className="w-full px-3 py-2 border rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Section</label>
              <select
                value={filters.section_id}
                onChange={(e) => setFilters({ ...filters, section_id: e.target.value })}
                className="w-full px-3 py-2 border rounded text-sm"
              >
                <option value="">Semua</option>
                {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="w-full px-3 py-2 border rounded text-sm"
              >
                <option value="">Semua</option>
                <option value="draft">Draft</option>
                <option value="approved">Approved</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={fetchWorkPlans}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                🔍 Filter
              </button>
            </div>
          </div>
        </div>

        {/* Work Plans List */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b">
            <div className="text-sm text-gray-600">Total: {workPlans.length} work plans</div>
          </div>
          <div className="overflow-x-auto">
            {loading ? (
              <div className="text-center py-8">Loading...</div>
            ) : workPlans.length === 0 ? (
              <div className="text-center py-8 text-gray-500">Tidak ada work plan</div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bulan Target</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Section</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Activity</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stage</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created By</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {workPlans.map(plan => (
                    <tr key={plan.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium">
                        {new Date(plan.target_bulan).toLocaleDateString('id-ID', { year: 'numeric', month: 'long' })}
                      </td>
                      <td className="px-4 py-3 text-sm">{plan.sections?.name}</td>
                      <td className="px-4 py-3 text-sm">{plan.activity_types?.name}</td>
                      <td className="px-4 py-3 text-sm">{plan.vendors?.name || '-'}</td>
                      <td className="px-4 py-3 text-sm">{plan.activity_stages?.name || '-'}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-1 rounded text-xs ${getStatusBadge(plan.status)}`}>
                          {plan.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">{plan.users?.full_name}</td>
                      <td className="px-4 py-3 text-sm space-x-2">
                        <button
                          onClick={() => handleViewDetail(plan)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          Detail
                        </button>
                        {plan.status === 'draft' && (
                          <>
                            <button
                              onClick={() => handleUpdateStatus(plan.id, 'approved')}
                              className="text-green-600 hover:text-green-800"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleDelete(plan.id)}
                              className="text-red-600 hover:text-red-800"
                            >
                              Delete
                            </button>
                          </>
                        )}
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

  // ========== RENDER CREATE VIEW ==========
  if (activeView === 'create') {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Buat Work Plan Baru</h1>
          <button
            onClick={() => setActiveView('list')}
            className="px-4 py-2 border rounded hover:bg-gray-50"
          >
            ← Kembali
          </button>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6">
          {/* Header Info */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Section *</label>
              <select
                value={formData.section_id}
                onChange={(e) => setFormData({ ...formData, section_id: e.target.value })}
                className="w-full px-3 py-2 border rounded"
                required
              >
                <option value="">Pilih Section</option>
                {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Activity Type *</label>
              <select
                value={formData.activity_type_id}
                onChange={(e) => setFormData({ ...formData, activity_type_id: e.target.value })}
                className="w-full px-3 py-2 border rounded"
                required
              >
                <option value="">Pilih Activity</option>
                {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Bulan Target *</label>
              <input
                type="month"
                value={formData.target_bulan}
                onChange={(e) => setFormData({ ...formData, target_bulan: e.target.value })}
                className="w-full px-3 py-2 border rounded"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Vendor</label>
              <select
                value={formData.vendor_id}
                onChange={(e) => setFormData({ ...formData, vendor_id: e.target.value })}
                className="w-full px-3 py-2 border rounded"
              >
                <option value="">Pilih Vendor</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Stage</label>
              <select
                value={formData.stage_id}
                onChange={(e) => setFormData({ ...formData, stage_id: e.target.value })}
                className="w-full px-3 py-2 border rounded"
              >
                <option value="">Pilih Stage</option>
                {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Alternative Option</label>
              <input
                type="text"
                value={formData.alternative_option}
                onChange={(e) => setFormData({ ...formData, alternative_option: e.target.value })}
                placeholder="Normal A, Alt 1, dst"
                className="w-full px-3 py-2 border rounded"
              />
            </div>
          </div>

          {/* Block Selection */}
          <div className="border-t pt-4">
            <h3 className="font-semibold mb-3">Pilih Blok *</h3>
            <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto border rounded p-3">
              {blocks.map(block => (
                <label
                  key={block.id}
                  className="flex items-center p-2 border rounded hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedBlocks.some(b => b.block_id === block.id)}
                    onChange={() => handleBlockToggle(block)}
                    className="mr-2"
                  />
                  <span className="text-sm">
                    {block.kawasan} - {block.code} ({block.name}) - {block.luas_total} Ha
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-2 text-sm text-gray-600">
              {selectedBlocks.length} blok dipilih, Total: {selectedBlocks.reduce((sum, b) => sum + parseFloat(b.luas_total), 0).toFixed(2)} Ha
            </div>
          </div>

          {/* Materials */}
          {materials.length > 0 && (
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-3">Rencana Material</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Material</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Default Dosis</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Total Quantity</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Unit</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Required</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {materials.map((mat) => (
                      <tr key={mat.material_id}>
                        <td className="px-3 py-2 text-sm">{mat.material_code} - {mat.material_name}</td>
                        <td className="px-3 py-2 text-sm">{mat.default_dosis} {mat.unit}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="0.001"
                            value={selectedMaterials.find(m => m.material_id === mat.material_id)?.total_quantity || ''}
                            onChange={(e) => handleMaterialChange(mat.material_id, e.target.value)}
                            className="w-32 px-2 py-1 border rounded text-sm"
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

          {/* Submit */}
          <div className="flex justify-end gap-2 border-t pt-4">
            <button
              type="button"
              onClick={() => setActiveView('list')}
              className="px-4 py-2 border rounded hover:bg-gray-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
            >
              {loading ? 'Menyimpan...' : 'Simpan Work Plan'}
            </button>
          </div>
        </form>
      </div>
    )
  }

  // ========== RENDER DETAIL VIEW ==========
  if (activeView === 'detail' && selectedPlan && planDetails) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Detail Work Plan</h1>
          <button
            onClick={() => setActiveView('list')}
            className="px-4 py-2 border rounded hover:bg-gray-50"
          >
            ← Kembali
          </button>
        </div>

        {/* Header Info */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <strong>Bulan Target:</strong>
              <div>{new Date(selectedPlan.target_bulan).toLocaleDateString('id-ID', { year: 'numeric', month: 'long' })}</div>
            </div>
            <div>
              <strong>Section:</strong>
              <div>{selectedPlan.sections?.name}</div>
            </div>
            <div>
              <strong>Activity:</strong>
              <div>{selectedPlan.activity_types?.name}</div>
            </div>
            <div>
              <strong>Vendor:</strong>
              <div>{selectedPlan.vendors?.name || '-'}</div>
            </div>
            <div>
              <strong>Stage:</strong>
              <div>{selectedPlan.activity_stages?.name || '-'}</div>
            </div>
            <div>
              <strong>Alternative:</strong>
              <div>{selectedPlan.alternative_option || '-'}</div>
            </div>
            <div>
              <strong>Status:</strong>
              <div><span className={`px-2 py-1 rounded text-xs ${getStatusBadge(selectedPlan.status)}`}>{selectedPlan.status}</span></div>
            </div>
            <div className="col-span-2">
              <strong>Created By:</strong>
              <div>{selectedPlan.users?.full_name} - {new Date(selectedPlan.created_at).toLocaleString('id-ID')}</div>
            </div>
          </div>

          {/* Status Actions */}
          {selectedPlan.status === 'draft' && (
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => handleUpdateStatus(selectedPlan.id, 'approved')}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                Approve
              </button>
              <button
                onClick={() => handleDelete(selectedPlan.id)}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          )}
          {selectedPlan.status === 'approved' && (
            <div className="mt-4">
              <button
                onClick={() => handleUpdateStatus(selectedPlan.id, 'in_progress')}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Start Progress
              </button>
            </div>
          )}
        </div>

        {/* Blocks */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold mb-3">Blok-blok ({planDetails.blocks.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kawasan</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nama</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kategori</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Luas Total</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Completed</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Remaining</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {planDetails.blocks.map(ba => (
                  <tr key={ba.id}>
                    <td className="px-4 py-3 text-sm">{ba.blocks?.kawasan}</td>
                    <td className="px-4 py-3 text-sm font-medium">{ba.blocks?.code}</td>
                    <td className="px-4 py-3 text-sm">{ba.blocks?.name}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded text-xs ${ba.blocks?.kategori === 'PC' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                        {ba.blocks?.kategori}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right">{ba.luas_total} Ha</td>
                    <td className="px-4 py-3 text-sm text-right">{ba.luas_completed} Ha</td>
                    <td className="px-4 py-3 text-sm text-right">{ba.luas_remaining} Ha</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded text-xs ${getStatusBadge(ba.status)}`}>
                        {ba.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold">
                <tr>
                  <td colSpan="4" className="px-4 py-3 text-sm text-right">Total:</td>
                  <td className="px-4 py-3 text-sm text-right">
                    {planDetails.blocks.reduce((sum, b) => sum + parseFloat(b.luas_total), 0).toFixed(2)} Ha
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    {planDetails.blocks.reduce((sum, b) => sum + parseFloat(b.luas_completed), 0).toFixed(2)} Ha
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    {planDetails.blocks.reduce((sum, b) => sum + parseFloat(b.luas_remaining), 0).toFixed(2)} Ha
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Materials */}
        {planDetails.materials.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold mb-3">Rencana Material ({planDetails.materials.length})</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Qty</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Allocated</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Remaining</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {planDetails.materials.map(pm => (
                    <tr key={pm.id}>
                      <td className="px-4 py-3 text-sm">{pm.materials?.code} - {pm.materials?.name}</td>
                      <td className="px-4 py-3 text-sm text-right">{pm.total_quantity}</td>
                      <td className="px-4 py-3 text-sm text-right">{pm.allocated_quantity}</td>
                      <td className="px-4 py-3 text-sm text-right">{pm.remaining_quantity}</td>
                      <td className="px-4 py-3 text-sm">{pm.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    )
  }

  return null
}