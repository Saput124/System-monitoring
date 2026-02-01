import { useState, useRef } from 'react'
import TransactionInput from './TransactionInput'
import TransactionHistory from './TransactionHistory'

export default function Transaction({ user }) {
  const [activeTab, setActiveTab] = useState('input')
  const historyRef = useRef()

  // 🔥 FIX: Callback untuk refresh history setelah transaksi berhasil
  const handleTransactionSuccess = () => {
    // Switch ke history tab dan trigger refresh
    setActiveTab('history')
    if (historyRef.current && historyRef.current.refreshData) {
      historyRef.current.refreshData()
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Transaksi</h1>

      <div className="bg-white rounded-lg shadow">
        <div className="border-b">
          <div className="flex space-x-4">
            <button
              onClick={() => setActiveTab('input')}
              className={`px-6 py-3 text-sm font-medium ${activeTab === 'input' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}
            >
              📝 Input Transaksi
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-6 py-3 text-sm font-medium ${activeTab === 'history' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}
            >
              📚 History
            </button>
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'input' ? (
            <TransactionInput 
              user={user} 
              onTransactionSuccess={handleTransactionSuccess}
            />
          ) : (
            <TransactionHistory 
              user={user} 
              ref={historyRef}
            />
          )}
        </div>
      </div>
    </div>
  )
}