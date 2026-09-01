import { useEffect, useRef } from 'react';

export default function AutoTextarea({ value, onChange, placeholder, disabled, onKeyDown }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = '24px';
    ref.current.style.height = Math.min(ref.current.scrollHeight, 200) + 'px';
  }, [value]);

  return (
    <textarea
      ref={ref}
      className="chat-textarea"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      onKeyDown={onKeyDown}
    />
  );
}
