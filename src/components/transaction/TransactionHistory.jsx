import { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabase'

export default function TransactionHistory({ user }) {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({
    start_date: '',
    end_date: '',
    section_id: '',
    activity_type_id: ''
  })
  const [sections, setSections] = useState([])
  const [activities, setActivities] = useState([])
  const [selectedTransaction, setSelectedTransaction] = useState(null)

  useEffect(() => {
    fetchMasterData()
    fetchTransactions()
  }, [])

  const fetchMasterData = async () => {
    const [s, a] = await Promise.all([
      supabase.from('sections').select('*').eq('active', true),
      supabase.from('activity_types').select('*').eq('active', true)
    ])
    
    setSections(s.data || [])
    setActivities(a.data || [])
  }

  const fetchTransactions = async () => {
    setLoading(true)
    
    let query = supabase
      .from('transactions')
      .select(`
        *,
        block_activities(
          *,
          blocks(code, name, kawasan, luas_total, kategori),
          activity_plans(
            *,
            sections(name),
            activity_types(name),
            vendors(name)
          )
        ),
        transaction_materials(*, materials(code, name, unit)),
        users(full_name)
      `)
      .order('tanggal', { ascending: false })
      .limit(100)

    if (filters.start_date) {
      query = query.gte('tanggal', filters.start_date)
    }
    if (filters.end_date) {
      query = query.lte('tanggal', filters.end_date)
    }

    const { data } = await query
    
    let filtered = data || []
    
    if (filters.section_id) {
      filtered = filtered.filter(t => t.block_activities.activity_plans.section_id === filters.section_id)
    }
    if (filters.activity_type_id) {
      filtered = filtered.filter(t => t.block_activities.activity_plans.activity_type_id === filters.activity_type_id)
    }
    if (user.role === 'section_head') {
      filtered = filtered.filter(t => t.block_activities.activity_plans.section_id === user.section_id)
    }
    if (user.role === 'vendor') {
      filtered = filtered.filter(t => t.block_activities.activity_plans.vendor_id === user.vendor_id)
    }

    setTransactions(filtered)
    setLoading(false)
  }

  const handleDetail = (transaction) => {
    setSelectedTransaction(transaction)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Transaction History</h1>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="mb-4">
          <h3 className="font-semibold mb-3">Filter</h3>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Tanggal Mulai</label>
              <input 
                type="date" 
                value={filters.start_date} 
                onChange={(e) => setFilters({...filters, start_date: e.target.value})} 
                className="w-full px-2 py-1 text-sm border rounded" 
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Tanggal Akhir</label>
              <input 
                type="date" 
                value={filters.end_date} 
                onChange={(e) => setFilters({...filters, end_date: e.target.value})} 
                className="w-full px-2 py-1 text-sm border rounded" 
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Section</label>
              <select 
                value={filters.section_id} 
                onChange={(e) => setFilters({...filters, section_id: e.target.value})} 
                className="w-full px-2 py-1 text-sm border rounded"
              >
                <option value="">Semua</option>
                {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Activity</label>
              <select 
                value={filters.activity_type_id} 
                onChange={(e) => setFilters({...filters, activity_type_id: e.target.value})} 
                className="w-full px-2 py-1 text-sm border rounded"
              >
                <option value="">Semua</option>
                {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={fetchTransactions} className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">🔍 Filter</button>
            <button 
              onClick={() => {
                setFilters({ start_date: '', end_date: '', section_id: '', activity_type_id: '' })
                setTimeout(fetchTransactions, 100)
              }}
              className="px-4 py-2 border rounded text-sm hover:bg-gray-50"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="text-sm text-gray-600 mb-3">Total: {transactions.length} transaksi</div>

        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">Tidak ada transaksi</div>
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
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {transactions.map(tx => (
                  <tr key={tx.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">{new Date(tx.tanggal).toLocaleDateString('id-ID')}</td>
                    <td className="px-3 py-2">{tx.block_activities.activity_plans.activity_types.name}</td>
                    <td className="px-3 py-2">{tx.block_activities.activity_plans.sections.name}</td>
                    <td className="px-3 py-2 font-medium">{tx.block_activities.blocks.code}</td>
                    <td className="px-3 py-2 text-right font-medium">{parseFloat(tx.luas_dikerjakan).toFixed(2)}</td>
                    <td className="px-3 py-2">{tx.block_activities.activity_plans.vendors?.name || '-'}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{tx.users.full_name}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => handleDetail(tx)} className="text-blue-600 hover:text-blue-800">Detail</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedTransaction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-bold">Detail Transaksi</h2>
              <button onClick={() => setSelectedTransaction(null)} className="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-3 rounded">
                  <div className="text-xs text-gray-600 mb-1">Tanggal</div>
                  <div className="font-medium">{new Date(selectedTransaction.tanggal).toLocaleDateString('id-ID', { dateStyle: 'full' })}</div>
                </div>
                <div className="bg-gray-50 p-3 rounded">
                  <div className="text-xs text-gray-600 mb-1">Activity</div>
                  <div className="font-medium">{selectedTransaction.block_activities.activity_plans.activity_types.name}</div>
                </div>
              </div>

              <div className="border-t pt-3">
                <h3 className="font-semibold mb-2">Informasi Blok</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-gray-600">Code:</span> <span className="font-medium">{selectedTransaction.block_activities.blocks.code}</span></div>
                  <div><span className="text-gray-600">Nama:</span> <span className="font-medium">{selectedTransaction.block_activities.blocks.name}</span></div>
                  <div><span className="text-gray-600">Kawasan:</span> <span className="font-medium">{selectedTransaction.block_activities.blocks.kawasan}</span></div>
                  <div><span className="text-gray-600">Kategori:</span> <span className="font-medium">{selectedTransaction.block_activities.blocks.kategori}</span></div>
                  <div><span className="text-gray-600">Luas Total:</span> <span className="font-medium">{selectedTransaction.block_activities.blocks.luas_total} Ha</span></div>
                  <div><span className="text-gray-600">Luas Dikerjakan:</span> <span className="font-medium text-green-600">{parseFloat(selectedTransaction.luas_dikerjakan).toFixed(2)} Ha</span></div>
                </div>
              </div>

              <div className="border-t pt-3">
                <h3 className="font-semibold mb-2">Informasi Pelaksanaan</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-gray-600">Section:</span> <span className="font-medium">{selectedTransaction.block_activities.activity_plans.sections.name}</span></div>
                  <div><span className="text-gray-600">Vendor:</span> <span className="font-medium">{selectedTransaction.block_activities.activity_plans.vendors?.name || '-'}</span></div>
                  {selectedTransaction.jumlah_pekerja && <div><span className="text-gray-600">Jumlah Pekerja:</span> <span className="font-medium">{selectedTransaction.jumlah_pekerja} orang</span></div>}
                  <div><span className="text-gray-600">Input By:</span> <span className="font-medium">{selectedTransaction.users.full_name}</span></div>
                </div>
              </div>

              {selectedTransaction.transaction_materials && selectedTransaction.transaction_materials.length > 0 && (
                <div className="border-t pt-3">
                  <h3 className="font-semibold mb-2">Material yang Digunakan</h3>
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
                            <td className="px-3 py-2">{tm.materials.code} - {tm.materials.name}</td>
                            <td className="px-3 py-2 text-right font-medium">{parseFloat(tm.quantity_used).toFixed(3)}</td>
                            <td className="px-3 py-2">{tm.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {(selectedTransaction.kondisi || selectedTransaction.catatan) && (
                <div className="border-t pt-3">
                  <h3 className="font-semibold mb-2">Catatan</h3>
                  {selectedTransaction.kondisi && (
                    <div className="mb-2">
                      <div className="text-xs text-gray-600">Kondisi:</div>
                      <div className="text-sm">{selectedTransaction.kondisi}</div>
                    </div>
                  )}
                  {selectedTransaction.catatan && (
                    <div>
                      <div className="text-xs text-gray-600">Catatan:</div>
                      <div className="text-sm">{selectedTransaction.catatan}</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end mt-6">
              <button onClick={() => setSelectedTransaction(null)} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">Tutup</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
