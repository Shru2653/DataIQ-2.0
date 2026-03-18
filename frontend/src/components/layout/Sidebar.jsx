import React from 'react'

export default function Sidebar({ sidebarOpen, setSidebarOpen, sections }){
  return (
    <aside className={`fixed lg:relative inset-y-0 left-0 z-40 w-72 bg-white/90 backdrop-blur-lg border-r border-blue-100 shadow-lg transform transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
      <div className="p-6 pt-8 h-full overflow-y-auto">
        {sections.map((section, sectionIndex) => (
          <div key={section.title} className="mb-8">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
              {section.title}
            </h3>
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon
                const isActive = false
                return (
                  <button
                    key={item.id}
                    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-left transition-all duration-300 group ${
                      isActive ? 'bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 shadow-md border-l-4 border-blue-500' : 'text-slate-600 hover:bg-blue-50 hover:text-blue-600'
                    }`}
                  >
                    <Icon className={`w-5 h-5 transition-colors ${isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-blue-500'}`} />
                    <span className="font-medium">{item.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}
