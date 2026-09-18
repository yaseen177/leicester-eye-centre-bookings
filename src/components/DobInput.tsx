import { useState, useEffect } from 'react';

// Date-of-birth box that the user TYPES into as DD/MM/YYYY.
// The value passed in/out is always ISO (YYYY-MM-DD), so everything else in the
// app (age calc, Firestore, reports, CRM) keeps working untouched.
// onChange only emits a complete, real, non-future date -- otherwise it emits ''
// so existing "!dob" checks keep blocking the form.

export const isoToDisplay = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

export const displayToIso = (text: string): string => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!m) return '';
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const d = new Date(year, month - 1, day);
  // Rejects impossible dates such as 31/02/1990
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return '';
  if (year < 1900) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d > today) return ''; // no future dates of birth
  return `${m[3]}-${m[2]}-${m[1]}`;
};

// Digits only, slashes inserted automatically: 01021990 -> 01/02/1990
const formatTyping = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

interface DobInputProps {
  value: string; // ISO YYYY-MM-DD, or '' if empty / incomplete / invalid
  onChange: (iso: string) => void;
  className?: string;
}

export default function DobInput({ value, onChange, className = '' }: DobInputProps) {
  const [text, setText] = useState(isoToDisplay(value));
  const [touched, setTouched] = useState(false);

  // If the parent sets or clears the value (CRM patient picked, form reset),
  // reflect it in the box. Half-typed text is left alone.
  useEffect(() => {
    if (value !== displayToIso(text)) setText(isoToDisplay(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = (raw: string) => {
    const formatted = formatTyping(raw);
    setText(formatted);
    onChange(displayToIso(formatted));
  };

  const invalid = text !== '' && !displayToIso(text);
  const showError = invalid && (touched || text.length === 10);

  return (
    <div>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="DD/MM/YYYY"
        maxLength={10}
        value={text}
        onChange={e => handleChange(e.target.value)}
        onBlur={() => setTouched(true)}
        className={className}
      />
      {showError && (
        <p className="text-red-500 text-[10px] font-bold mt-1 ml-1 uppercase">
          Enter a valid date of birth as DD/MM/YYYY
        </p>
      )}
    </div>
  );
}