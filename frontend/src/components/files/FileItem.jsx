export default function FileItem({ file, onClick, actions }) {
  return (
    <div className="file-item" onClick={onClick}>
      <span>{file?.name || file?.filename}</span>
      <div className="file-actions">{actions}</div>
    </div>
  );
}
