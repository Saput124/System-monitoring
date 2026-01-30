import { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabase'
import * as XLSX from 'xlsx'

export default function TransactionHistory({ user }) {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({
    start_date: new Date(new Date().setDate(1)).toISOString().split('T')[0], // Awal bulan
    end_date: new Date().toISOString().split('T')[0], // Hari ini
    vendor_id: user.role === 'vendor' ? user.vendor_id : '',
    section_id: user.section_id || '',
    activity_type_id: '',
    block_id: '',
    status: ''
  })
  const [vendors, setVendors] = useState([])
  const [sections, setSections] = useState([])
  const [activities, setActivities] = useState([])
  const [blocks, setBlocks] = useState([])
  const [selectedTransaction, setSelectedTransaction] = useState(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [transactionDetails, setTransactionDetails] = useState(null)

  useEffect(() => {
    fetchMasterData()
    fetchTransactions()
  }, [])

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

  const fetchTransactions = async () => {
    setLoading(true)
    
    let query = supabase
      .from('transactions')
      .select(`
        *,
        vendors(name),
        sections(name),
        activity_types(name),
        blocks(kawasan, code, name, kategori),
        users!transactions_created_by_fkey(full_name)
      `)
      .gte('transaction_date', filters.start_date)
      .lte('transaction_date', filters.end_date)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (filters.vendor_id) query = query.eq('vendor_id', filters.vendor_id)
    if (filters.section_id) query = query.eq('section_id', filters.section_id)
    if (filters.activity_type_id) query = query.eq('activity_type_id', filters.activity_type_id)
    if (filters.block_id) query = query.eq('block_id', filters.block_id)
    if (filters.status) query = query.eq('status', filters.status)

    const { data, error } = await query

    if (!error) {
      setTransactions(data || [])
    }
    setLoading(false)
  }

  const fetchTransactionDetails = async (transactionId) => {
    const [workers, materials] = await Promise.all([
      supabase
        .from('transaction_workers')
        .select('*, workers(code, name)')
        .eq('transaction_id', transactionId),
      supabase
        .from('transaction_materials')
        .select('*, materials(code, name), activity_stages(name)')
        .eq('transaction_id', transactionId)
    ])

    setTransactionDetails({
      workers: workers.data || [],
      materials: materials.data || []
    })
  }

  const handleViewDetail = async (transaction) => {
    setSelectedTransaction(transaction)
    await fetchTransactionDetails(transaction.id)
    setShowDetailModal(true)
  }

  const handleDelete = async (id) => {
    if (!confirm('Yakin hapus transaksi ini?')) return

    const { error } = await supabase.from('transactions').delete().eq('id', id)

    if (!error) {
      alert('✅ Transaksi berhasil dihapus')
      fetchTransactions()
    } else {
      alert('❌ Error: ' + error.message)
    }
  }

  const handleUpdateStatus = async (id, newStatus) => {
    const { error } = await supabase
      .from('transactions')
      .update({ status: newStatus })
      .eq('id', id)

    if (!error) {
      alert('✅ Status berhasil diupdate')
      fetchTransactions()
    } else {
      alert('❌ Error: ' + error.message)
    }
  }

  const handleExportExcel = () => {
    const exportData = transactions.map(t => ({
      Tanggal: new Date(t.transaction_date).toLocaleDateString('id-ID'),
      Vendor: t.vendors?.name,
      Section: t.sections?.name,
      Activity: t.activity_types?.name,
      Block: `${t.blocks?.kawasan} - ${t.blocks?.code}`,
      'Luas Kerja': t.luas_kerja,
      'Jumlah Pekerja': t.worker_count,
      Status: t.status,
      Catatan: t.notes || '-',
      'Dibuat Oleh': t.users?.full_name,
      'Waktu Input': new Date(t.created_at).toLocaleString('id-ID')
    }))

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions')
    XLSX.writeFile(wb, `Transactions_${filters.start_date}_to_${filters.end_date}.xlsx`)
  }

  const getStatusBadge = (status) => {
    const colors = {
      draft: 'bg-gray-100 text-gray-800',
      submitted: 'bg-blue-100 text-blue-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800'
    }
    return colors[status] || colors.draft
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Transaction History</h1>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-semibold mb-3">Filter</h3>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Dari Tanggal</label>
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) => setFilters({...filters, start_date: e.target.value})}
              className="w-full px-3 py-2 border rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Sampai Tanggal</label>
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) => setFilters({...filters, end_date: e.target.value})}
              className="w-full px-3 py-2 border rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Vendor</label>
            <select
              value={filters.vendor_id}
              onChange={(e) => setFilters({...filters, vendor_id: e.target.value})}
              className="w-full px-3 py-2 border rounded text-sm"
              disabled={user.role === 'vendor'}
            >
              <option value="">Semua</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Section</label>
            <select
              value={filters.section_id}
              onChange={(e) => setFilters({...filters, section_id: e.target.value})}
              className="w-full px-3 py-2 border rounded text-sm"
            >
              <option value="">Semua</option>
              {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Activity</label>
            <select
              value={filters.activity_type_id}
              onChange={(e) => setFilters({...filters, activity_type_id: e.target.value})}
              className="w-full px-3 py-2 border rounded text-sm"
            >
              <option value="">Semua</option>
              {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Block</label>
            <select
              value={filters.block_id}
              onChange={(e) => setFilters({...filters, block_id: e.target.value})}
              className="w-full px-3 py-2 border rounded text-sm"
            >
              <option value="">Semua</option>
              {blocks.map(b => <option key={b.id} value={b.id}>{b.kawasan} - {b.code}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({...filters, status: e.target.value})}
              className="w-full px-3 py-2 border rounded text-sm"
            >
              <option value="">Semua</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={fetchTransactions}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              🔍 Filter
            </button>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-600">
          Total: {transactions.length} transaksi
        </div>
        <button
          onClick={handleExportExcel}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        >
          📤 Export Excel
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="text-center py-8">Loading...</div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">Tidak ada data</div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tanggal</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Section</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Activity</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Block</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Luas</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pekerja</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {transactions.map(tx => (
                  <tr key={tx.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">
                      {new Date(tx.transaction_date).toLocaleDateString('id-ID')}
                    </td>
                    <td className="px-4 py-3 text-sm">{tx.vendors?.name}</td>
                    <td className="px-4 py-3 text-sm">{tx.sections?.name}</td>
                    <td className="px-4 py-3 text-sm">{tx.activity_types?.name}</td>
                    <td className="px-4 py-3 text-sm">
                      {tx.blocks?.kawasan} - {tx.blocks?.code}
                      <div className="text-xs text-gray-500">{tx.blocks?.name}</div>
                    </td>
                    <td className="px-4 py-3 text-sm">{tx.luas_kerja} Ha</td>
                    <td className="px-4 py-3 text-sm">{tx.worker_count}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded text-xs ${getStatusBadge(tx.status)}`}>
                        {tx.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm space-x-2">
                      <button
                        onClick={() => handleViewDetail(tx)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        Detail
                      </button>
                      {tx.status === 'draft' && (
                        <>
                          <button
                            onClick={() => handleUpdateStatus(tx.id, 'submitted')}
                            className="text-green-600 hover:text-green-800"
                          >
                            Submit
                          </button>
                          <button
                            onClick={() => handleDelete(tx.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            Delete
                          </button>
                        </>
                      )}
                      {(user.role === 'admin' || user.role === 'supervisor') && tx.status === 'submitted' && (
                        <>
                          <button
                            onClick={() => handleUpdateStatus(tx.id, 'approved')}
                            className="text-green-600 hover:text-green-800"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleUpdateStatus(tx.id, 'rejected')}
                            className="text-red-600 hover:text-red-800"
                          >
                            Reject
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

      {/* Detail Modal */}
      {showDetailModal && selectedTransaction && transactionDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Detail Transaksi</h2>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>

              {/* Header Info */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4 grid grid-cols-2 gap-4 text-sm">
                <div><strong>Tanggal:</strong> {new Date(selectedTransaction.transaction_date).toLocaleDateString('id-ID')}</div>
                <div><strong>Status:</strong> <span className={`px-2 py-1 rounded text-xs ${getStatusBadge(selectedTransaction.status)}`}>{selectedTransaction.status}</span></div>
                <div><strong>Vendor:</strong> {selectedTransaction.vendors?.name}</div>
                <div><strong>Section:</strong> {selectedTransaction.sections?.name}</div>
                <div><strong>Activity:</strong> {selectedTransaction.activity_types?.name}</div>
                <div><strong>Block:</strong> {selectedTransaction.blocks?.kawasan} - {selectedTransaction.blocks?.code}</div>
                <div><strong>Luas Kerja:</strong> {selectedTransaction.luas_kerja} Ha</div>
                <div><strong>Jumlah Pekerja:</strong> {selectedTransaction.worker_count}</div>
                <div className="col-span-2"><strong>Catatan:</strong> {selectedTransaction.notes || '-'}</div>
                <div className="col-span-2 text-xs text-gray-500">
                  Dibuat oleh: {selectedTransaction.users?.full_name} pada {new Date(selectedTransaction.created_at).toLocaleString('id-ID')}
                </div>
              </div>

              {/* Workers */}
              <div className="mb-4">
                <h3 className="font-semibold mb-2">Pekerja ({transactionDetails.workers.length})</h3>
                <div className="border rounded">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left">No</th>
                        <th className="px-3 py-2 text-left">Code</th>
                        <th className="px-3 py-2 text-left">Nama</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {transactionDetails.workers.map((w, idx) => (
                        <tr key={w.id}>
                          <td className="px-3 py-2">{idx + 1}</td>
                          <td className="px-3 py-2">{w.workers?.code}</td>
                          <td className="px-3 py-2">{w.workers?.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Materials */}
              {transactionDetails.materials.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2">Material yang Digunakan ({transactionDetails.materials.length})</h3>
                  <div className="border rounded">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left">Material</th>
                          <th className="px-3 py-2 text-left">Stage</th>
                          <th className="px-3 py-2 text-left">Alternative</th>
                          <th className="px-3 py-2 text-right">Dosis</th>
                          <th className="px-3 py-2 text-left">Unit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {transactionDetails.materials.map((m) => (
                          <tr key={m.id}>
                            <td className="px-3 py-2">{m.materials?.code} - {m.materials?.name}</td>
                            <td className="px-3 py-2">{m.activity_stages?.name || '-'}</td>
                            <td className="px-3 py-2">{m.alternative_option || '-'}</td>
                            <td className="px-3 py-2 text-right">{m.dosis_used}</td>
                            <td className="px-3 py-2">{m.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex justify-end mt-4">
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="px-4 py-2 border rounded hover:bg-gray-50"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}