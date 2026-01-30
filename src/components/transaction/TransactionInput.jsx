import { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabase'

export default function TransactionInput({ user }) {

  // ================= STATE =================

  const [step, setStep] = useState(1)
  const [workPlans, setWorkPlans] = useState([])
  const [selectedWorkPlan, setSelectedWorkPlan] = useState(null)
  const [blockActivities, setBlockActivities] = useState([])
  const [workers, setWorkers] = useState([])
  const [selectedWorkers, setSelectedWorkers] = useState([])
  const [loading, setLoading] = useState(false)

  const [transactionDate, setTransactionDate] = useState(
    new Date().toISOString().split('T')[0]
  )

  const [selectedBlocks, setSelectedBlocks] = useState([])

  // ================= EFFECT =================

  useEffect(() => {
    fetchWorkPlans()
  }, [user])

  useEffect(() => {
    if (selectedWorkPlan) {
      fetchWorkPlanDetails()
      fetchWorkers()
    }
  }, [selectedWorkPlan])

  // ================= FETCH =================

  const fetchWorkPlans = async () => {
    setLoading(true)

    let query = supabase
      .from('activity_plans')
      .select(`
        *,
        sections(name),
        activity_types(name),
        vendors(name)
      `)
      .in('status', ['approved', 'in_progress'])
      .order('target_bulan', { ascending: false })

    if (user.section_id) {
      query = query.eq('section_id', user.section_id)
    }

    if (user.role === 'vendor' && user.vendor_id) {
      query = query.eq('vendor_id', user.vendor_id)
    }

    const { data } = await query
    setWorkPlans(data || [])
    setLoading(false)
  }

  const fetchWorkPlanDetails = async () => {
    const { data } = await supabase
      .from('block_activities')
      .select(`
        *,
        blocks(kawasan, code, name, luas_total)
      `)
      .eq('activity_plan_id', selectedWorkPlan.id)
      .gt('luas_remaining', 0)
      .order('created_at')

    setBlockActivities(data || [])
  }

  const fetchWorkers = async () => {
    if (!selectedWorkPlan?.vendor_id) return

    const { data } = await supabase
      .from('workers')
      .select('*')
      .eq('vendor_id', selectedWorkPlan.vendor_id)
      .eq('active', true)

    setWorkers(data || [])
  }

  // ================= BLOCK HANDLING =================

  const handleAddBlock = () => {
    setSelectedBlocks(prev => [
      ...prev,
      {
        block_activity_id: '',
        luas_dikerjakan: '',
        hasil_kerja: '',
        kondisi: ''
      }
    ])
  }

  const handleBlockChange = (index, field, value) => {
    setSelectedBlocks(prev => {
      const updated = [...prev]
      updated[index][field] = value
      return updated
    })
  }

  const handleRemoveBlock = (index) => {
    setSelectedBlocks(prev => prev.filter((_, i) => i !== index))
  }

  const availableBlocks = blockActivities.filter(
    ba => !selectedBlocks.some(sb => sb.block_activity_id === ba.id)
  )

  // ================= WORKER =================

  const handleWorkerToggle = (id) => {
    setSelectedWorkers(prev =>
      prev.includes(id)
        ? prev.filter(w => w !== id)
        : [...prev, id]
    )
  }

  // ================= SUBMIT =================

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (selectedBlocks.length === 0) {
        alert('❌ Minimal 1 blok harus diinput')
        setLoading(false)
        return
      }

      if (selectedWorkers.length === 0) {
        alert('❌ Minimal pilih 1 pekerja')
        setLoading(false)
        return
      }

      // VALIDASI LUAS
      for (let block of selectedBlocks) {
        const ba = blockActivities.find(b => b.id === block.block_activity_id)
        if (!ba) continue

        if (parseFloat(block.luas_dikerjakan) > parseFloat(ba.luas_remaining)) {
          alert(`❌ Luas melebihi remaining pada block ${ba.blocks.code}`)
          setLoading(false)
          return
        }
      }

      // 1️⃣ Insert Header
      const { data: transaction, error } = await supabase
        .from('transactions')
        .insert({
          activity_plan_id: selectedWorkPlan.id,
          tanggal: transactionDate,
          jumlah_pekerja: selectedWorkers.length,
          created_by: user.id
        })
        .select()
        .single()

      if (error) throw error

      // 2️⃣ Insert Transaction Blocks
      const blockInsert = selectedBlocks.map(b => ({
        transaction_id: transaction.id,
        block_activity_id: b.block_activity_id,
        luas_dikerjakan: parseFloat(b.luas_dikerjakan),
        hasil_kerja: b.hasil_kerja || null,
        kondisi: b.kondisi || null
      }))

      const { error: blockError } = await supabase
        .from('transaction_blocks')
        .insert(blockInsert)

      if (blockError) throw blockError

      // 3️⃣ Update luas_remaining
      for (let b of selectedBlocks) {
        const ba = blockActivities.find(x => x.id === b.block_activity_id)

        await supabase
          .from('block_activities')
          .update({
            luas_remaining:
              parseFloat(ba.luas_remaining) -
              parseFloat(b.luas_dikerjakan)
          })
          .eq('id', b.block_activity_id)
      }

      // 4️⃣ Insert Workers
      const workerInsert = selectedWorkers.map(w => ({
        transaction_id: transaction.id,
        worker_id: w
      }))

      await supabase
        .from('transaction_workers')
        .insert(workerInsert)

      alert('✅ Transaksi berhasil disimpan')

      // RESET
      setStep(1)
      setSelectedWorkPlan(null)
      setSelectedBlocks([])
      setSelectedWorkers([])
      fetchWorkPlans()

    } catch (err) {
      console.error(err)
      alert('❌ Error: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // ================= UI =================

  if (step === 1) {
    return (
      <div>
        <h2 className="text-xl font-bold mb-4">Pilih Work Plan</h2>
        {workPlans.map(plan => (
          <div key={plan.id} className="border p-4 mb-3 rounded">
            <div>{plan.sections?.name} - {plan.activity_types?.name}</div>
            <div>{plan.vendors?.name}</div>
            <button
              className="mt-2 px-3 py-1 bg-blue-600 text-white rounded"
              onClick={() => {
                setSelectedWorkPlan(plan)
                setStep(2)
              }}
            >
              Pilih
            </button>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Input Transaksi</h2>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* DATE */}
        <input
          type="date"
          value={transactionDate}
          onChange={(e) => setTransactionDate(e.target.value)}
          className="border px-3 py-2 rounded"
        />

        {/* BLOCK SECTION */}
        <div>
          <h3 className="font-semibold mb-2">Blok Dikerjakan</h3>

          {selectedBlocks.map((block, index) => (
            <div key={index} className="border p-4 mb-3 rounded bg-gray-50">

              <select
                value={block.block_activity_id}
                onChange={(e) =>
                  handleBlockChange(index, 'block_activity_id', e.target.value)
                }
                className="border px-2 py-1 rounded w-full mb-2"
                required
              >
                <option value="">Pilih Block</option>
                {availableBlocks.concat(
                  blockActivities.filter(b => b.id === block.block_activity_id)
                ).map(ba => (
                  <option key={ba.id} value={ba.id}>
                    {ba.blocks?.code} - Remaining: {ba.luas_remaining} Ha
                  </option>
                ))}
              </select>

              <input
                type="number"
                step="0.01"
                placeholder="Luas Dikerjakan"
                value={block.luas_dikerjakan}
                onChange={(e) =>
                  handleBlockChange(index, 'luas_dikerjakan', e.target.value)
                }
                className="border px-2 py-1 rounded w-full mb-2"
                required
              />

              <input
                type="text"
                placeholder="Hasil Kerja"
                value={block.hasil_kerja}
                onChange={(e) =>
                  handleBlockChange(index, 'hasil_kerja', e.target.value)
                }
                className="border px-2 py-1 rounded w-full mb-2"
              />

              <input
                type="text"
                placeholder="Kondisi"
                value={block.kondisi}
                onChange={(e) =>
                  handleBlockChange(index, 'kondisi', e.target.value)
                }
                className="border px-2 py-1 rounded w-full mb-2"
              />

              <button
                type="button"
                onClick={() => handleRemoveBlock(index)}
                className="text-red-600 text-sm"
              >
                Hapus Blok
              </button>

            </div>
          ))}

          <button
            type="button"
            onClick={handleAddBlock}
            className="px-3 py-1 bg-green-600 text-white rounded"
          >
            + Tambah Blok
          </button>
        </div>

        {/* WORKERS */}
        <div>
          <h3 className="font-semibold mb-2">Pilih Pekerja</h3>
          <div className="grid grid-cols-3 gap-2">
            {workers.map(w => (
              <label key={w.id}>
                <input
                  type="checkbox"
                  checked={selectedWorkers.includes(w.id)}
                  onChange={() => handleWorkerToggle(w.id)}
                />
                {w.name}
              </label>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          {loading ? 'Menyimpan...' : 'Simpan Transaksi'}
        </button>

      </form>
    </div>
  )
}