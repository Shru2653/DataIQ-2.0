import React, { useState, useRef, useEffect } from "react";
import {
  MessageCircle,
  X,
  Send,
  Upload,
  Bot,
  User,
  Loader2,
  BarChart2,
  Sparkles,
  ShieldCheck,
  Lightbulb,
  RefreshCw,
  Download,
  Filter,
  TrendingUp,
  PieChart,
  ArrowUpDown,
  Hash,
  Activity,
  Layers,
} from "lucide-react";
import axiosClient from "../../api/axiosClient";

// ── Quick action buttons ──────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { label: "Summary",     icon: <BarChart2 size={13} />,    query: "Give me a summary of the dataset",   color: "blue" },
  { label: "Insights",    icon: <Lightbulb size={13} />,    query: "Show me key insights",               color: "yellow" },
  { label: "Issues",      icon: <ShieldCheck size={13} />,  query: "Check for data issues",              color: "red" },
  { label: "Clean Data",  icon: <RefreshCw size={13} />,    query: "Clean the data",                     color: "green" },
  { label: "Columns",     icon: <Layers size={13} />,       query: "List all columns",                   color: "purple" },
  { label: "Bar Chart",   icon: <BarChart2 size={13} />,    query: "Show me a bar chart",                color: "blue" },
  { label: "Pie Chart",   icon: <PieChart size={13} />,     query: "Show me a pie chart",                color: "pink" },
  { label: "Histogram",   icon: <Activity size={13} />,     query: "Show histogram",                     color: "indigo" },
  { label: "Scatter",     icon: <Sparkles size={13} />,     query: "Show scatter plot",                  color: "teal" },
  { label: "Heatmap",     icon: <Layers size={13} />,       query: "Show correlation heatmap",           color: "orange" },
  { label: "Top 10",      icon: <TrendingUp size={13} />,   query: "Show top 10 rows",                   color: "green" },
  { label: "Sort",        icon: <ArrowUpDown size={13} />,  query: "Sort by first column descending",    color: "gray" },
  { label: "Group By",    icon: <Hash size={13} />,         query: "Group by category and sum",          color: "purple" },
  { label: "Correlation", icon: <Activity size={13} />,     query: "Show correlation between columns",   color: "blue" },
  { label: "Unique",      icon: <Filter size={13} />,       query: "Show unique values",                 color: "teal" },
  { label: "Sample",      icon: <Sparkles size={13} />,     query: "Show me a random sample of 5 rows", color: "gray" },
  { label: "Download",    icon: <Download size={13} />,     query: "Download cleaned data",              color: "green" },
  { label: "Reset Data",  icon: <RefreshCw size={13} />,    query: "Reset to original data",             color: "red" },
];

const ACTION_COLOR_MAP = {
  blue:   "bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200 hover:border-blue-400",
  yellow: "bg-yellow-50 hover:bg-yellow-100 text-yellow-700 border-yellow-200 hover:border-yellow-400",
  red:    "bg-red-50 hover:bg-red-100 text-red-700 border-red-200 hover:border-red-400",
  green:  "bg-green-50 hover:bg-green-100 text-green-700 border-green-200 hover:border-green-400",
  purple: "bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200 hover:border-purple-400",
  pink:   "bg-pink-50 hover:bg-pink-100 text-pink-700 border-pink-200 hover:border-pink-400",
  indigo: "bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200 hover:border-indigo-400",
  teal:   "bg-teal-50 hover:bg-teal-100 text-teal-700 border-teal-200 hover:border-teal-400",
  orange: "bg-orange-50 hover:bg-orange-100 text-orange-700 border-orange-200 hover:border-orange-400",
  gray:   "bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-300 hover:border-gray-400",
};

// ── Markdown-lite renderer (bold + bullet) ────────────────────────────────────
function RenderText({ text }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-0.5 text-sm leading-relaxed">
      {lines.map((line, i) => {
        // Bold: **text**
        const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
          /^\*\*[^*]+\*\*$/.test(part) ? (
            <strong key={j}>{part.slice(2, -2)}</strong>
          ) : (
            part
          )
        );
        return (
          <p key={i} className={line.startsWith("•") || line.startsWith("-") ? "pl-2" : ""}>
            {parts}
          </p>
        );
      })}
    </div>
  );
}

// ── Single message bubble ─────────────────────────────────────────────────────
function Message({ msg }) {
  const isUser = msg.sender === "user";

  return (
    <div className={`flex gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shadow ${
          isUser ? "bg-blue-500" : "bg-gradient-to-br from-purple-500 to-blue-600"
        }`}
      >
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[82%] rounded-2xl px-3 py-2 shadow-sm ${
          isUser
            ? "bg-blue-500 text-white rounded-tr-sm"
            : "bg-white text-gray-800 border border-gray-100 rounded-tl-sm"
        }`}
      >
        {msg.chart ? (
          <div className="space-y-1">
            <RenderText text={msg.text} />
            <img
              src={`data:image/png;base64,${msg.chart}`}
              alt="chart"
              className="rounded-lg mt-2 w-full object-contain border border-gray-100"
            />
          </div>
        ) : (
          <RenderText text={msg.text} />
        )}
        <p className={`text-[10px] mt-1 text-right ${isUser ? "text-blue-100" : "text-gray-400"}`}>
          {msg.time}
        </p>
      </div>
    </div>
  );
}

// ── Typing indicator ──────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="flex gap-2 items-end">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center flex-shrink-0">
        <Bot size={14} className="text-white" />
      </div>
      <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
        <div className="flex gap-1 items-center">
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

// ── Main Chatbot component ────────────────────────────────────────────────────
export default function Chatbot({ filename: propFilename }) {
  const [open, setOpen]               = useState(false);
  const [messages, setMessages]       = useState([
    {
      sender: "bot",
      text:   "👋 Hi! I'm **DataIQ Assistant**.\n\nUpload a CSV file or select one from your workspace, then ask me anything about your data!",
      chart:  null,
      time:   now(),
    },
  ]);
  const [input, setInput]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [sessionId, setSessionId]     = useState(() => crypto.randomUUID());
  const [filename, setFilename]       = useState(propFilename || null);
  const [uploading, setUploading]     = useState(false);
  const [fileInfo, setFileInfo]       = useState(null);
  const [showAllActions, setShowAll]  = useState(false);

  const bottomRef    = useRef(null);
  const inputRef     = useRef(null);
  const fileInputRef = useRef(null);

  // Keep filename in sync with parent prop (selected dataset)
  useEffect(() => {
    if (propFilename && propFilename !== filename) {
      setFilename(propFilename);
      setFileInfo(null);
      addBotMessage(
        `📂 Dataset switched to **${propFilename}**.\nYou can now ask me questions about it!`
      );
    }
  }, [propFilename]);

  // Auto-scroll
  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open, loading]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function now() {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function addBotMessage(text, chart = null) {
    setMessages((prev) => [...prev, { sender: "bot", text, chart, time: now() }]);
  }

  // ── File upload ─────────────────────────────────────────────────────────────
  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await axiosClient.post("/api/chatbot/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const data = res.data;
      const newSessionId = data.session_id;

      setSessionId(newSessionId);
      setFilename(data.filename);
      setFileInfo({ rows: data.rows, columns: data.columns, names: data.column_names });

      addBotMessage(
        `✅ **${file.name}** uploaded!\n\n` +
        `• **Rows:** ${data.rows.toLocaleString()}\n` +
        `• **Columns:** ${data.columns}\n` +
        `• **Fields:** ${data.column_names.slice(0, 6).join(", ")}${data.column_names.length > 6 ? ", …" : ""}\n\n` +
        `Ask me anything about your data, or use the quick buttons below!`
      );
    } catch (err) {
      addBotMessage(
        `❌ Upload failed: ${err?.response?.data?.detail || err.message || "Unknown error"}`
      );
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  // ── Send query ──────────────────────────────────────────────────────────────
  async function sendMessage(queryText) {
    const text = (queryText || input).trim();
    if (!text || loading) return;

    setMessages((prev) => [...prev, { sender: "user", text, chart: null, time: now() }]);
    setInput("");
    setLoading(true);

    try {
      const res = await axiosClient.post("/api/chatbot/chat", {
        session_id: sessionId,
        filename:   filename || null,
        query:      text,
      });
      const { response, chart, type, download_filename } = res.data;

      // Handle download trigger
      if (type === "download" && sessionId) {
        try {
          const dlRes = await axiosClient.get(`/api/chatbot/download/${sessionId}`, {
            responseType: "blob",
          });
          const url  = URL.createObjectURL(new Blob([dlRes.data], { type: "text/csv" }));
          const link = document.createElement("a");
          link.href  = url;
          link.download = download_filename || "dataset_cleaned.csv";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          addBotMessage(`✅ **Download started!** File saved as \`${link.download}\`.`);
        } catch {
          addBotMessage(response || "⚠️ Download failed.");
        }
      } else {
        addBotMessage(response || "No response received.", chart || null);
      }
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        err?.data?.detail ||
        err.message ||
        "Something went wrong.";
      addBotMessage(`❌ Error: ${detail}`);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function clearChat() {
    setMessages([
      {
        sender: "bot",
        text:   "🔄 Chat cleared! Ask me anything about your dataset.",
        chart:  null,
        time:   now(),
      },
    ]);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-3">

      {/* ── Chat panel ── */}
      {open && (
        <div className="w-[360px] bg-gray-50 rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
          style={{ height: "560px" }}>

          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <Bot size={18} className="text-white" />
              </div>
              <div>
                <p className="text-white font-semibold text-sm leading-none">DataIQ Assistant</p>
                <p className="text-blue-100 text-[10px] mt-0.5">
                  {filename ? `📂 ${filename.length > 28 ? filename.slice(0, 28) + "…" : filename}` : "No file selected"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={clearChat}
                title="Clear chat"
                className="p-1.5 rounded-lg hover:bg-white/20 transition text-white"
              >
                <RefreshCw size={14} />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/20 transition text-white"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Upload bar */}
          <div className="bg-white border-b border-gray-100 px-3 py-2 flex items-center gap-2 flex-shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={handleFileUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Upload size={12} />
              )}
              {uploading ? "Uploading…" : "Upload CSV"}
            </button>

            {fileInfo && (
              <span className="text-[10px] text-gray-500 truncate">
                {fileInfo.rows.toLocaleString()} rows · {fileInfo.columns} cols
              </span>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 scroll-smooth">
            {messages.map((msg, i) => (
              <Message key={i} msg={msg} />
            ))}
            {loading && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>

          {/* Quick actions */}
          <div className="px-3 py-2 bg-white border-t border-gray-100 flex-shrink-0">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Quick Actions</span>
              <button
                onClick={() => setShowAll((v) => !v)}
                className="text-[10px] text-blue-500 hover:text-blue-700 font-medium transition"
              >
                {showAllActions ? "Show less ↑" : `+${QUICK_ACTIONS.length - 6} more ↓`}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(showAllActions ? QUICK_ACTIONS : QUICK_ACTIONS.slice(0, 6)).map((action) => (
                <button
                  key={action.label}
                  onClick={() => sendMessage(action.query)}
                  disabled={loading}
                  className={`flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full border transition disabled:opacity-40 ${
                    ACTION_COLOR_MAP[action.color] || ACTION_COLOR_MAP.gray
                  }`}
                >
                  {action.icon}
                  {action.label}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <div className="px-3 py-3 bg-white border-t border-gray-100 flex gap-2 items-end flex-shrink-0">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              placeholder={filename ? "Ask about your data…" : "Upload a file first…"}
              className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent disabled:bg-gray-50 max-h-24 leading-5"
              style={{ minHeight: "38px" }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              className="flex-shrink-0 w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white flex items-center justify-center transition shadow-sm"
            >
              {loading ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Send size={15} />
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Floating toggle button ── */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-300 ${
          open
            ? "bg-gray-700 hover:bg-gray-800 rotate-0"
            : "bg-gradient-to-br from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
        }`}
        title={open ? "Close chat" : "Open DataIQ Assistant"}
      >
        {open ? (
          <X size={22} className="text-white" />
        ) : (
          <MessageCircle size={22} className="text-white" />
        )}
      </button>
    </div>
  );
}
