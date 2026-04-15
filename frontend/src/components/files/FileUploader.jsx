import { motion } from "framer-motion";
import { RefreshCw, Upload } from "lucide-react";
import React from "react";

export default function FileUploader({
  onSelect,
  uploading = false,
  progress = 0,
  accept = "*",
  multiple = false,
}) {
  const fileInputRef = React.useRef(null);

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    if (multiple) {
      onSelect?.(files);
    } else {
      onSelect?.(files[0]);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="w-full"
    >
      <div className="animate-slide-up" style={{ animationDelay: "0.2s" }}>
        <div
          onClick={handleFileClick}
          className="w-full min-h-[200px] relative group cursor-pointer bg-[var(--card)] border-2 border-dashed border-[var(--border)] rounded-2xl p-12 flex items-center justify-center text-center hover:border-[var(--border-active)] hover:bg-[var(--accent-light)] transition-all duration-500"
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleChange}
            accept={accept}
            multiple={multiple}
            className="hidden"
          />

          <div className="relative">
            <div className="w-16 h-16 mx-auto mb-4 bg-[var(--card)] border border-[var(--border)] rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              {uploading ? (
                <RefreshCw className="w-8 h-8 text-[var(--accent)] animate-spin" />
              ) : (
                <Upload className="w-8 h-8 text-[var(--accent)]" />
              )}
            </div>

            <h3 className="text-xl font-semibold text-[var(--text)] mb-2">
              {uploading ? "Uploading..." : "Drag & drop files here"}
            </h3>
            <p className="text-sm text-[var(--text2)]">
              {uploading ? `${progress}% complete` : "or click to browse"}
            </p>

            {uploading && (
              <div className="mt-4 w-64 mx-auto bg-[color-mix(in_srgb,var(--border),#ffffff_35%)] rounded-full h-2">
                <div
                  className="bg-[var(--accent)] h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>

          <div className="absolute inset-0 rounded-2xl bg-[var(--accent)] opacity-0 group-hover:opacity-[0.06] transition-opacity duration-500 -z-10" />
        </div>
      </div>
    </motion.div>
  );
}
