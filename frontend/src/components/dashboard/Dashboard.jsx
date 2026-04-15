import React, { useState } from 'react';
import { BarChart, Activity, FileText } from 'lucide-react';
import ChartPlot from './ChartPlot';

export default function Dashboard({ statistics, schema, dataQuality }) {
  const [activeTab, setActiveTab] = useState('stats');

  if (!statistics && !schema) return null;

  // Prepare correlation heatmap data
  const correlationData = statistics?.correlation_matrix ? (() => {
    const matrix = statistics.correlation_matrix;
    const cols = Object.keys(matrix);
    const rows = [];
    
    cols.forEach((col1) => {
      cols.forEach((col2) => {
        const value = matrix[col1]?.[col2];
        if (value !== undefined && value !== null && !isNaN(value)) {
          rows.push({
            x: col1,
            y: col2,
            value: Number(value).toFixed(2)
          });
        }
      });
    });
    
    return rows;
  })() : null;

  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
      {/* Tab Navigation */}
      <div className="border-b border-gray-200 bg-gray-50">
        <div className="flex gap-1 p-2">
          <button
            onClick={() => setActiveTab('stats')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'stats'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <BarChart className="w-4 h-4" />
            Statistics
          </button>
          <button
            onClick={() => setActiveTab('correlation')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'correlation'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <Activity className="w-4 h-4" />
            Correlations
          </button>
          <button
            onClick={() => setActiveTab('schema')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'schema'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <FileText className="w-4 h-4" />
            Schema
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-8 lg:p-10">
        {/* Statistics Tab */}
        {activeTab === 'stats' && statistics?.numeric_summary && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Numeric Summary</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Metric</th>
                    {Object.keys(statistics.numeric_summary).map((col) => (
                      <th key={col} className="text-right py-2 px-3 font-medium text-gray-700">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {['count', 'mean', 'std', 'min', '25%', '50%', '75%', 'max'].map((metric) => (
                    <tr key={metric} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3 font-medium text-gray-600">{metric}</td>
                      {Object.keys(statistics.numeric_summary).map((col) => {
                        const value = statistics.numeric_summary[col]?.[metric];
                        return (
                          <td key={col} className="text-right py-2 px-3 text-gray-900">
                            {value !== null && value !== undefined && !isNaN(value)
                              ? Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })
                              : 'N/A'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Outlier Counts */}
            {statistics.outlier_counts && Object.keys(statistics.outlier_counts).length > 0 && (
              <div className="mt-6">
                <h4 className="text-md font-semibold text-gray-800 mb-3">Outliers Detected</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {Object.entries(statistics.outlier_counts).map(([col, count]) => (
                    <div key={col} className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="text-xs text-gray-600 mb-1">{col}</div>
                      <div className="text-lg font-bold text-blue-600">{count}</div>
                      <div className="text-xs text-gray-500">outliers</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Correlation Tab */}
        {activeTab === 'correlation' && statistics?.correlation_matrix && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Correlation Matrix</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Variable</th>
                    {Object.keys(statistics.correlation_matrix).map((col) => (
                      <th key={col} className="text-center py-2 px-3 font-medium text-gray-700">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(statistics.correlation_matrix).map((row) => (
                    <tr key={row} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3 font-medium text-gray-600">{row}</td>
                      {Object.keys(statistics.correlation_matrix).map((col) => {
                        const value = statistics.correlation_matrix[row]?.[col];
                        const absValue = Math.abs(value || 0);
                        
                        // Color coding based on correlation strength
                        let bgColor = 'bg-gray-50';
                        if (!isNaN(value)) {
                          if (absValue > 0.7) bgColor = value > 0 ? 'bg-green-100' : 'bg-red-100';
                          else if (absValue > 0.4) bgColor = value > 0 ? 'bg-green-50' : 'bg-red-50';
                        }
                        
                        return (
                          <td key={col} className={`text-center py-2 px-3 ${bgColor}`}>
                            <span className="font-mono text-gray-900">
                              {value !== null && value !== undefined && !isNaN(value)
                                ? Number(value).toFixed(2)
                                : '-'}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 text-xs text-gray-500 flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-100 border border-green-200 rounded" />
                <span>Strong positive (≥0.7)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-100 border border-red-200 rounded" />
                <span>Strong negative (≤-0.7)</span>
              </div>
            </div>
          </div>
        )}

        {/* Schema Tab */}
        {activeTab === 'schema' && schema && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="text-xs text-gray-600 mb-1">Total Rows</div>
                <div className="text-2xl font-bold text-blue-600">
                  {schema.row_count?.toLocaleString()}
                </div>
                {schema.sampled_rows && schema.sampled_rows < schema.row_count && (
                  <div className="text-xs text-gray-500 mt-1">
                    (Sampled: {schema.sampled_rows.toLocaleString()})
                  </div>
                )}
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="text-xs text-gray-600 mb-1">Total Columns</div>
                <div className="text-2xl font-bold text-purple-600">
                  {schema.column_count}
                </div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="text-xs text-gray-600 mb-1">Data Quality</div>
                <div className="text-2xl font-bold text-green-600">
                  {dataQuality ? `${(100 - dataQuality.total_missing_percent).toFixed(1)}%` : 'N/A'}
                </div>
              </div>
            </div>

            <h3 className="text-lg font-semibold text-gray-900 mb-4">Column Details</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Column</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Type</th>
                    <th className="text-center py-2 px-3 font-medium text-gray-700">Missing %</th>
                    <th className="text-center py-2 px-3 font-medium text-gray-700">Attributes</th>
                  </tr>
                </thead>
                <tbody>
                  {schema.columns && Object.entries(schema.columns).map(([colName, colInfo]) => (
                    <tr key={colName} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3 font-medium text-gray-900">{colName}</td>
                      <td className="py-2 px-3">
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700">
                          {colInfo.dtype}
                        </span>
                      </td>
                      <td className="text-center py-2 px-3">
                        <span className={`font-medium ${
                          colInfo.missing_percent > 20 ? 'text-red-600' :
                          colInfo.missing_percent > 5 ? 'text-amber-600' :
                          'text-green-600'
                        }`}>
                          {colInfo.missing_percent?.toFixed(1)}%
                        </span>
                      </td>
                      <td className="text-center py-2 px-3">
                        <div className="flex gap-1 justify-center flex-wrap">
                          {colInfo.is_numeric && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700">
                              Numeric
                            </span>
                          )}
                          {colInfo.is_datetime && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-700">
                              DateTime
                            </span>
                          )}
                          {colInfo.is_categorical && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">
                              Categorical
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}