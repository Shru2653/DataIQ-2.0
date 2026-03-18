import { motion } from "framer-motion";
import ActionCard from "./ActionCard.jsx";
import { useMemo, useState } from "react";

const TABS = [
  { id: "cleaning", name: "🧹 Data Cleaning" },
  { id: "preparation", name: "🔬 Feature Preparation" },
  { id: "analysis", name: "📊 Business Analysis" },
];

export default function ProcessingPanel({
  steps = [],
  hasSelectedFile = false,
}) {
  const [expandedCard, setExpandedCard] = useState(null);
  const [activeTab, setActiveTab] = useState(TABS[0].id);

  const handleToggle = (cardId) => {
    setExpandedCard((prev) => (prev === cardId ? null : cardId));
  };

  const filteredSteps = useMemo(
    () => steps.filter((s) => s.category === activeTab),
    [steps, activeTab],
  );

  return (
    <div className="space-y-14">
      {/* Tabs */}
      <div className="mb-8">
        <div className="flex space-x-2 border-b border-slate-200">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 font-semibold text-sm transition-colors ${
                activeTab === tab.id
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {tab.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
        {filteredSteps.map((card) => (
          <ActionCard
            key={card.key}
            card={card}
            isExpanded={expandedCard === card.key}
            hasSelectedFile={hasSelectedFile}
            onToggle={() => handleToggle(card.key)}
            onExecute={card.onRun}
            onPreview={card.onPreview}
            onDownload={card.onDownload}
          />
        ))}
      </div>
    </div>
  );
}
