"use client";
import { useEffect, useRef, useState } from "react";

interface NumberInputProps {
  value: number | string | null | undefined;
  onChange: (value: number) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
}

/**
 * A custom numeric input that avoids the pitfalls of `<input type="number">`:
 * - No native up/down spinner arrows
 * - Can be fully cleared (no stuck "0")
 * - No leading zeros like "0100"
 * It keeps a local string state while typing and only emits a number when valid.
 */
export default function NumberInput({ value, onChange, className, placeholder, disabled, min, max }: NumberInputProps) {
  const [text, setText] = useState<string>(value === "" || value == null ? "" : String(value));
  const focusedRef = useRef(false);

  // Sync from outside only when not focused (so typing isn't overwritten).
  useEffect(() => {
    if (!focusedRef.current) {
      setText(value === "" || value == null ? "" : String(value));
    }
  }, [value]);

  const normalize = (raw: string): string => {
    let clean = raw.replace(/[^0-9.]/g, "");
    const firstDot = clean.indexOf(".");
    if (firstDot !== -1) {
      clean = clean.slice(0, firstDot + 1) + clean.slice(firstDot + 1).replace(/\./g, "");
    }
    return clean;
  };

  const emit = (clean: string) => {
    const num = parseFloat(clean);
    if (Number.isNaN(num)) {
      onChange(0);
    } else {
      let clamped = num;
      if (min !== undefined && clamped < min) clamped = min;
      if (max !== undefined && clamped > max) clamped = max;
      onChange(clamped);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const clean = normalize(e.target.value);
    setText(clean);
    emit(clean);
  };

  const handleBlur = () => {
    focusedRef.current = false;
    const num = parseFloat(text);
    if (Number.isNaN(num)) {
      setText("");
    } else {
      // Remove leading zeros: "0100" -> "100"
      setText(String(num));
      emit(String(num));
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      onChange={handleChange}
      onFocus={() => { focusedRef.current = true; }}
      onBlur={handleBlur}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
    />
  );
}
