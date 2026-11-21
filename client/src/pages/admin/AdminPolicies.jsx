
function AdminPolicies() {

  return (
    <div>

      <div className="flex items-center justify-between mb-8">

        <h1 className="text-2xl font-serif text-white">
          Policies
        </h1>

        <button className="bg-[#c8102e] hover:bg-[#a80d26] text-white px-6 py-2.5 rounded-lg text-sm transition">
          Add rule
        </button>

      </div>

      <div className="border border-[#00d5c0] rounded-xl p-6">

        <p className="text-gray-400 text-sm">
          Policies management will appear here.
        </p>

      </div>

    </div>
  )
}

export default AdminPolicies
