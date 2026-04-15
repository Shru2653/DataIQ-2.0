import { useMemo } from "react";
import Plot from "react-plotly.js";
import { defaultLayout, defaultConfig } from "../../utils/chartColors";

// Enhanced Plotly chart with support for more types
// Props:
// - type: 'line' | 'bar' | 'pie' | 'histogram' | 'scatter' | 'heatmap'
// - data: array of records OR prebuilt Plotly traces
// - xKey: key for x axis when providing records
// - yKeys: keys for y values (array) when providing records
// - title: chart title
// - layout: layout overrides
// - config: config overrides
// - height: chart height
export default function ChartPlot({
  type = "line",
  data = [],
  xKey,
  yKeys = [],
  title,
  layout = {},
  config = {},
  height = 360,
}) {
  const seriesColors = ["#4361ee", "#10b981", "#2563eb", "#6b7280", "#8b5cf6"];

  const traces = useMemo(() => {
    // If the consumer passed in prebuilt traces (array of objects with x/y/type), use them directly
    const looksLikeTraces =
      Array.isArray(data) && data.length > 0 && (data[0]?.x || data[0]?.type);
    if (looksLikeTraces) return data;

    if (!Array.isArray(data) || !xKey) return [];

    // Histogram
    if (type === "histogram") {
      const yKey = yKeys[0] || "count";
      return [
        {
          type: "bar",
          x: data.map((d) => d[xKey]),
          y: data.map((d) => d[yKey]),
          marker: {
            color: "rgba(59, 130, 246, 0.7)",
            line: {
              color: "rgba(59, 130, 246, 1)",
              width: 1,
            },
          },
          name: "Frequency",
        },
      ];
    }

    // Scatter plot
    if (type === "scatter") {
      const keys = yKeys.length ? yKeys : ["value"];
      return keys.map((yk) => ({
        type: "scatter",
        mode: "markers",
        name: yk,
        x: data.map((d) => d[xKey]),
        y: data.map((d) => d[yk]),
        marker: {
          size: 8,
          opacity: 0.6,
          line: {
            width: 1,
            color: "white",
          },
        },
      }));
    }

    // Heatmap
    if (type === "heatmap") {
      // Assuming data is in format [{ x, y, value }]
      const uniqueX = [...new Set(data.map((d) => d[xKey]))];
      const uniqueY = [...new Set(data.map((d) => d.y))];

      const zMatrix = uniqueY.map((yVal) =>
        uniqueX.map((xVal) => {
          const point = data.find((d) => d[xKey] === xVal && d.y === yVal);
          return point ? point.value : null;
        }),
      );

      return [
        {
          type: "heatmap",
          x: uniqueX,
          y: uniqueY,
          z: zMatrix,
          colorscale: "RdBu",
          zmid: 0,
          text: zMatrix,
          texttemplate: "%{text:.2f}",
          textfont: { size: 10 },
          hoverongaps: false,
        },
      ];
    }

    // Pie chart
    if (type === "pie") {
      const labels = data.map((d) => d[xKey]);
      const yKey = yKeys[0];
      const values = yKey ? data.map((d) => d[yKey]) : data.map(() => 1);
      return [
        {
          type: "pie",
          labels,
          values,
          hoverinfo: "label+percent+value",
          textinfo: "percent",
          textposition: "inside",
          marker: {
            line: {
              color: "white",
              width: 2,
            },
          },
        },
      ];
    }

    // Line and Bar charts
    const keys = yKeys.length ? yKeys : ["value"];
    return keys.map((yk, idx) => ({
      type: type === "bar" ? "bar" : "scatter",
      mode: type === "line" ? "lines+markers" : undefined,
      name: yk,
      x: data.map((d) => d[xKey]),
      y: data.map((d) => d[yk]),
      line:
        type === "line"
          ? {
              color: seriesColors[idx % seriesColors.length],
              width: 3,
            }
          : undefined,
      marker:
        type === "bar"
          ? {
              color: seriesColors[idx % seriesColors.length],
              opacity: 0.8,
              line: {
                width: 1,
                color: "white",
              },
            }
          : {
              color: seriesColors[idx % seriesColors.length],
              size: type === "line" ? 7 : undefined,
            },
    }));
  }, [data, type, xKey, yKeys]);

  const derivedLayout = useMemo(() => {
    const baseLayout = {
      ...defaultLayout,
      title: undefined,
      font: {
        color: "#334155",
      },
      xaxis: {
        showgrid: false,
        zeroline: false,
        color: "#64748b",
      },
      yaxis: {
        gridcolor: "rgba(148, 163, 184, 0.18)",
        zeroline: false,
        color: "#64748b",
      },
      ...layout,
    };

    // Special layouts for specific chart types
    if (type === "histogram") {
      return {
        ...baseLayout,
        xaxis: {
          ...baseLayout.xaxis,
          title: undefined,
          tickangle: -90,
        },
        yaxis: { ...baseLayout.yaxis, title: "Frequency" },
        margin: { l: 56, r: 20, t: 12, b: 96 },
        bargap: 0.1,
      };
    }

    if (type === "scatter") {
      return {
        ...baseLayout,
        hovermode: "closest",
        xaxis: { ...baseLayout.xaxis, title: undefined },
        yaxis: { ...baseLayout.yaxis, title: undefined },
      };
    }

    if (type === "heatmap") {
      return {
        ...baseLayout,
        xaxis: { ...baseLayout.xaxis, side: "bottom" },
        yaxis: { ...baseLayout.yaxis, autorange: "reversed" },
      };
    }

    return baseLayout;
  }, [layout, title, type, xKey, yKeys]);

  const derivedConfig = useMemo(
    () => ({
      ...defaultConfig,
      ...config,
    }),
    [config],
  );

  if (!traces || traces.length === 0) {
    return (
      <div className="flex h-full min-h-[240px] items-center justify-center text-sm text-slate-400">
        No chart data
      </div>
    );
  }

  return (
    <Plot
      data={traces}
      layout={{ ...derivedLayout, height }}
      config={derivedConfig}
      useResizeHandler
      style={{ width: "100%", height }}
    />
  );
}
