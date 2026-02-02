export default function TabNavigation({ tabs, activeTab, onTabChange }) {
  return (
    <div className="border-b border-gray-200 bg-white rounded-t-lg">
      <div className="flex flex-wrap gap-2 px-4 sm:px-6 pt-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`
              relative px-4 sm:px-6 py-3 text-sm font-medium rounded-t-lg transition-all duration-200
              ${activeTab === tab.id
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
              }
            `}
          >
            <span className="flex items-center gap-2">
              {tab.icon && <span>{tab.icon}</span>}
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.shortLabel || tab.label}</span>
            </span>
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-white rounded-t"></div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
