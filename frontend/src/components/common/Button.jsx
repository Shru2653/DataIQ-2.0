export default function Button({ children, ...props }) {
  return (
    <button {...props} className={`btn ${props.className || ''}`.trim()}>
      {children}
    </button>
  );
}
