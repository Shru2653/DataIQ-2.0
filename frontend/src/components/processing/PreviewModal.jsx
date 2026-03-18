import { motion } from 'framer-motion';
import Modal from '../common/Modal.jsx';
import VirtualDataTable from '../VirtualDataTable.jsx';

export default function PreviewModal({ open, onClose, beforeData = [], afterData = [], title = 'Preview' }) {
  const rows = (Array.isArray(afterData) && afterData.length)
    ? afterData
    : (Array.isArray(beforeData) ? beforeData : []);
  const cols = Array.isArray(rows) && rows.length > 0
    ? Object.keys(rows[0]).map((k) => ({ header: k, accessorKey: k }))
    : [];
  return (
    <Modal open={open} onClose={onClose}>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
        className="w-[90vw] max-w-6xl max-h-[85vh] overflow-x-hidden overflow-y-hidden">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
          <button onClick={onClose} className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">Close</button>
        </div>
        <div className="grid gap-3">
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-2 overflow-hidden">
            {cols.length ? (
              <div className="w-full overflow-x-auto">
                <VirtualDataTable columns={cols} data={rows} height={'65vh'} />
              </div>
            ) : (
              <div className="text-sm text-slate-400">No preview</div>
            )}
          </div>
        </div>
      </motion.div>
    </Modal>
  );
}

