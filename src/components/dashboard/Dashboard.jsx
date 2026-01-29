export default function Dashboard({ user }) {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
      <div className="bg-white p-6 rounded-lg shadow">
        <p>Welcome, {user.full_name}!</p>
        <p className="text-sm text-gray-600 mt-2">Role: {user.role}</p>
      </div>
    </div>
  )
}
