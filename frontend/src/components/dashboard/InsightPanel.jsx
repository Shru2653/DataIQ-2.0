import React from 'react';
import { Lightbulb, AlertTriangle, CheckCircle, TrendingUp, AlertCircle } from 'lucide-react';

export default function InsightPanel({ insights = [], dataQuality = null }) {
  if (!insights || insights.length === 0) return null;

  return (
    <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
      <div className="flex items-center gap-2 mb-4">
        <Lightbulb className="w-5 h-5 text-[var(--accent)]" />
        <h3 className="text-lg font-semibold text-[var(--text)]">Key Insights</h3>
      </div>

      <div className="space-y-3">
        {insights.map((insight, idx) => {
          // Determine insight type and icon
          let icon = CheckCircle;
          let colorClass = 'text-green-600';
          let bgClass = 'bg-green-50';
          let borderClass = 'border-green-200';

          if (insight.toLowerCase().includes('concern') || insight.toLowerCase().includes('missing')) {
            icon = AlertTriangle;
            colorClass = 'text-amber-600';
            bgClass = 'bg-amber-50';
            borderClass = 'border-amber-200';
          } else if (insight.toLowerCase().includes('growth') || insight.toLowerCase().includes('increasing')) {
            icon = TrendingUp;
            colorClass = 'text-green-600';
            bgClass = 'bg-green-50';
            borderClass = 'border-green-200';
          } else if (insight.toLowerCase().includes('declining') || insight.toLowerCase().includes('decreasing')) {
            icon = AlertCircle;
            colorClass = 'text-red-600';
            bgClass = 'bg-red-50';
            borderClass = 'border-red-200';
          } else if (insight.toLowerCase().includes('outlier') || insight.toLowerCase().includes('duplicate')) {
            icon = AlertTriangle;
            colorClass = 'text-blue-600';
            bgClass = 'bg-blue-50';
            borderClass = 'border-blue-200';
          }

          const Icon = icon;

          return (
            <div
              key={idx}
              className={`flex items-start gap-3 p-3 rounded-lg border ${bgClass} ${borderClass}`}
            >
              <Icon className={`w-5 h-5 ${colorClass} flex-shrink-0 mt-0.5`} />
              <p className="text-sm text-[var(--text)] flex-1">{insight}</p>
            </div>
          );
        })}
      </div>

      {/* Data Quality Summary */}
      {dataQuality && (
        <div className="mt-4 pt-4 border-t border-[var(--border)]">
          <div className="text-xs font-medium text-[var(--text2)] uppercase tracking-wide mb-2">
            Data Quality Score
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${dataQuality.total_missing_percent < 5 ? 'bg-green-500' : dataQuality.total_missing_percent < 15 ? 'bg-amber-500' : 'bg-red-500'}`} />
              <span className="text-sm text-[var(--text)]">
                Missing: <span className="font-medium">{dataQuality.total_missing_percent}%</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${dataQuality.duplicate_count === 0 ? 'bg-green-500' : 'bg-amber-500'}`} />
              <span className="text-sm text-[var(--text)]">
                Duplicates: <span className="font-medium">{dataQuality.duplicate_count}</span>
              </span>
            </div>
            {dataQuality.columns_with_issues && dataQuality.columns_with_issues.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-sm text-[var(--text)]">
                  Columns with issues: <span className="font-medium">{dataQuality.columns_with_issues.length}</span>
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}