import React from 'react'

export default function Sidebar({ sidebarOpen, setSidebarOpen, sections }){
  return (
    <aside className={`fixed lg:relative inset-y-0 left-0 z-40 w-[228px] bg-[var(--nav)] border-r border-[var(--border)] transform transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
      <div className="px-3 py-4 h-full overflow-y-auto">
        {sections.map((section, sectionIndex) => (
          <div key={section.title} className={sectionIndex === 0 ? "mb-2" : "mt-2 mb-2"}>
            <h3 className="text-[11px] font-semibold text-[var(--nav-muted)] uppercase tracking-[0.14em] px-2 pt-2 pb-1.5">
              {section.title}
            </h3>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon
                const isActive = false
                return (
                  <button
                    key={item.id}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all duration-150 group ${
                      isActive
                        ? 'bg-[var(--accent-light)] text-[var(--accent)]'
                        : 'text-[var(--nav-muted)] hover:bg-[var(--nav-active)] hover:text-[var(--nav-text)]'
                    }`}
                  >
                    <Icon className={`w-[18px] h-[18px] transition-colors ${isActive ? 'text-[var(--accent)]' : 'text-[color-mix(in_srgb,var(--text3),#ffffff_0%)] group-hover:text-[var(--accent)]'}`} />
                    <span className="font-medium text-[13.5px] leading-5">{item.label}</span>
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
