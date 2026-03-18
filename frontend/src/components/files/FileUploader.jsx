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
          className="w-full min-h-[200px] relative group cursor-pointer bg-white/70 backdrop-blur-sm border-2 border-dashed border-blue-200 rounded-2xl p-12 flex items-center justify-center text-center hover:border-blue-400 hover:bg-blue-50/50 transition-all duration-500 hover:shadow-xl hover:shadow-blue-100"
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
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              {uploading ? (
                <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
              ) : (
                <Upload className="w-8 h-8 text-blue-600" />
              )}
            </div>

            <h3 className="text-lg font-semibold text-slate-800 mb-2">
              {uploading ? "Uploading..." : "Drag & drop files here"}
            </h3>
            <p className="text-lg text-slate-500">
              {uploading ? `${progress}% complete` : "or click to browse"}
            </p>

            {uploading && (
              <div className="mt-4 w-64 mx-auto bg-blue-100 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>

          <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-400 via-indigo-500 to-blue-400 opacity-0 group-hover:opacity-20 transition-opacity duration-500 -z-10" />
        </div>
      </div>
    </motion.div>
  );
}
