import { useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import { supabase } from '../../utils/supabase'

const TransactionHistory = forwardRef(({ user }, ref) => {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({
    start_date: '',
    end_date: '',
    section_id: '',
    activity_id: ''
  })
  const [sections, setSections] = useState([])
  const [activities, setActivities] = useState([])
  const [selectedTransaction, setSelectedTransaction] = useState(null)

  useEffect(() => {
    fetchMasterData()
    fetchTransactions()
  }, [])

  // 🔥 FIX: Expose refresh method ke parent component
  useImperativeHandle(ref, () => ({
    refreshData: () => {
      fetchTransactions()
    }
  }))

  const fetchMasterData = async () => {
    const [s, a] = await Promise.all([
      supabase.from('sections').select('*').eq('active', true).order('name'),
      supabase.from('activities').select('*').eq('active', true).order('name')
    ])
    
    setSections(s.data || [])
    setActivities(a.data || [])
  }

  const fetchTransactions = async () => {
    setLoading(true)
    
    // 🔥 IMPROVEMENT: Semua filter diterapkan di server-side untuk performa lebih baik
    let query = supabase
      .from('transactions')
      .select(`
        *,
        transaction_blocks(
          *,
          blocks(code, name, kawasan, luas_total, kategori)
        ),
        activity_plans!inner(
          *,
          sections(name),
          activities(name),
          vendors(name),
          activity_stages(name)
        ),
        transaction_materials(*, materials(code, name, unit)),
        users(full_name)
      `)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200)

    // Server-side filters
    if (filters.start_date) {
      query = query.gte('transaction_date', filters.start_date)
    }
    if (filters.end_date) {
      query = query.lte('transaction_date', filters.end_date)
    }
    if (filters.section_id) {
      query = query.eq('activity_plans.section_id', filters.section_id)
    }
    if (filters.activity_id) {
      query = query.eq('activity_plans.activity_id', filters.activity_id)
    }

    // Role-based filtering
    if (user.role === 'section_head') {
      query = query.eq('activity_plans.section_id', user.section_id)
    } else if (user.role === 'vendor') {
      query = query.eq('activity_plans.vendor_id', user.vendor_id)
    }

    const { data, error } = await query
    
    if (error) {
      console.error('Error fetching transactions:', error)
      alert('❌ Gagal mengambil data transaksi')
    }

    setTransactions(data || [])
    setLoading(false)
  }

  const handleDetail = (transaction) => {
    setSelectedTransaction(transaction)
  }

  const handleApplyFilter = () => {
    fetchTransactions()
  }

  const handleResetFilter = () => {
    setFilters({ 
      start_date: '', 
      end_date: '', 
      section_id: '', 
      activity_id: '' 
    })
    setTimeout(() => fetchTransactions(), 100)
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="mb-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <span>🔍</span> Filter Transaksi
          </h3>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Tanggal Mulai</label>
              <input 
                type="date" 
                value={filters.start_date} 
                onChange={(e) => setFilters({...filters, start_date: e.target.value})} 
                className="w-full px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-blue-500" 
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Tanggal Akhir</label>
              <input 
                type="date" 
                value={filters.end_date} 
                onChange={(e) => setFilters({...filters, end_date: e.target.value})} 
                className="w-full px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-blue-500" 
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Section</label>
              <select 
                value={filters.section_id} 
                onChange={(e) => setFilters({...filters, section_id: e.target.value})} 
                className="w-full px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-blue-500"
                disabled={user.role === 'section_head'}
              >
                <option value="">Semua Section</option>
                {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Activity</label>
              <select 
                value={filters.activity_id} 
                onChange={(e) => setFilters({...filters, activity_id: e.target.value})} 
                className="w-full px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Semua Activity</option>
                {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button 
              onClick={handleApplyFilter} 
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              🔍 Terapkan Filter
            </button>
            <button 
              onClick={handleResetFilter}
              className="px-4 py-2 border rounded text-sm hover:bg-gray-50"
            >
              🔄 Reset
            </button>
          </div>
        </div>

        <div className="flex justify-between items-center mb-3">
          <div className="text-sm text-gray-600 font-medium">
            Total: <span className="text-blue-600">{transactions.length}</span> transaksi
          </div>
          {loading && (
            <div className="text-sm text-blue-600 flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              Loading...
            </div>
          )}
        </div>

        {transactions.length === 0 ? (
          <div className="text-center py-12 text-gray-500 bg-gray-50 rounded border-2 border-dashed">
            <div className="text-4xl mb-2">📭</div>
            <div>Tidak ada transaksi ditemukan</div>
            {(filters.start_date || filters.end_date || filters.section_id || filters.activity_id) && (
              <div className="text-xs mt-2">Coba ubah filter atau reset filter</div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tanggal</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Activity</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Section</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Blok</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Luas (Ha)</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {transactions.map(tx => (
                  <tr key={tx.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {new Date(tx.transaction_date).toLocaleDateString('id-ID')}
                    </td>
                    <td className="px-3 py-2">{tx.activity_plans?.activities?.name || '-'}</td>
                    <td className="px-3 py-2">{tx.activity_plans?.sections?.name || '-'}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">
                        {tx.transaction_blocks?.map(tb => tb.blocks?.code).join(', ') || '-'}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      {tx.transaction_blocks?.reduce((sum, tb) => sum + parseFloat(tb.luas_dikerjakan || 0), 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2">{tx.activity_plans?.vendors?.name || '-'}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{tx.users?.full_name || '-'}</td>
                    <td className="px-3 py-2 text-center">
                      <button 
                        onClick={() => handleDetail(tx)} 
                        className="text-blue-600 hover:text-blue-800 hover:underline text-xs font-medium"
                      >
                        Detail →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedTransaction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-bold">📋 Detail Transaksi</h2>
              <button 
                onClick={() => setSelectedTransaction(null)} 
                className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4">
              {/* Header Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-3 rounded">
                  <div className="text-xs text-gray-600 mb-1">Tanggal</div>
                  <div className="font-medium">
                    {new Date(selectedTransaction.transaction_date).toLocaleDateString('id-ID', { dateStyle: 'full' })}
                  </div>
                </div>
                <div className="bg-gray-50 p-3 rounded">
                  <div className="text-xs text-gray-600 mb-1">Activity</div>
                  <div className="font-medium">{selectedTransaction.activity_plans?.activities?.name || '-'}</div>
                </div>
              </div>

              {/* Block Information */}
              <div className="border-t pt-3">
                <h3 className="font-semibold mb-2">📍 Informasi Blok</h3>
                <div className="space-y-2">
                  {selectedTransaction.transaction_blocks?.map(tb => (
                    <div key={tb.id} className="bg-blue-50 p-3 rounded">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div><span className="text-gray-600">Code:</span> <span className="font-medium">{tb.blocks?.code}</span></div>
                        <div><span className="text-gray-600">Nama:</span> <span className="font-medium">{tb.blocks?.name}</span></div>
                        <div><span className="text-gray-600">Kawasan:</span> <span className="font-medium">{tb.blocks?.kawasan}</span></div>
                        <div><span className="text-gray-600">Kategori:</span> <span className="font-medium">{tb.blocks?.kategori}</span></div>
                        <div><span className="text-gray-600">Luas Total:</span> <span className="font-medium">{tb.blocks?.luas_total} Ha</span></div>
                        <div><span className="text-gray-600">Luas Dikerjakan:</span> <span className="font-medium text-green-600">{parseFloat(tb.luas_dikerjakan).toFixed(2)} Ha</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Execution Info */}
              <div className="border-t pt-3">
                <h3 className="font-semibold mb-2">👷 Informasi Pelaksanaan</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-gray-600">Section:</span> <span className="font-medium">{selectedTransaction.activity_plans?.sections?.name || '-'}</span></div>
                  <div><span className="text-gray-600">Vendor:</span> <span className="font-medium">{selectedTransaction.activity_plans?.vendors?.name || '-'}</span></div>
                  {selectedTransaction.jumlah_pekerja && (
                    <div><span className="text-gray-600">Jumlah Pekerja:</span> <span className="font-medium">{selectedTransaction.jumlah_pekerja} orang</span></div>
                  )}
                  <div><span className="text-gray-600">Input By:</span> <span className="font-medium">{selectedTransaction.users?.full_name || '-'}</span></div>
                </div>
              </div>

              {/* Materials */}
              {selectedTransaction.transaction_materials && selectedTransaction.transaction_materials.length > 0 && (
                <div className="border-t pt-3">
                  <h3 className="font-semibold mb-2">🧪 Material yang Digunakan</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left">Material</th>
                          <th className="px-3 py-2 text-right">Quantity</th>
                          <th className="px-3 py-2 text-left">Unit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {selectedTransaction.transaction_materials.map(tm => (
                          <tr key={tm.id}>
                            <td className="px-3 py-2">{tm.materials?.code} - {tm.materials?.name}</td>
                            <td className="px-3 py-2 text-right font-medium">{parseFloat(tm.quantity_used).toFixed(3)}</td>
                            <td className="px-3 py-2">{tm.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Notes */}
              {selectedTransaction.catatan && (
                <div className="border-t pt-3">
                  <h3 className="font-semibold mb-2">📝 Catatan</h3>
                  <div className="text-sm bg-gray-50 p-3 rounded">{selectedTransaction.catatan}</div>
                </div>
              )}
            </div>

            <div className="flex justify-end mt-6">
              <button 
                onClick={() => setSelectedTransaction(null)} 
                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

TransactionHistory.displayName = 'TransactionHistory'

export default TransactionHistory
