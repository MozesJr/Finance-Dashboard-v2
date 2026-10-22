import * as React from 'react';
import { cn } from '@/lib/utils';

const fieldClass =
  'w-full rounded-md border border-line bg-surface-2 px-3 text-sm text-fg placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(fieldClass, 'h-10', className)} {...props} />,
);
Input.displayName = 'Input';

/** Select native yang diberi gaya (tanpa dependensi tambahan). */
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(fieldClass, 'h-10', className)} {...props}>
      {children}
    </select>
  ),
);
Select.displayName = 'Select';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1 block text-xs font-medium text-muted', className)} {...props} />;
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-expense">{message}</p>;
}

/** Input warna terkendali (nilai selalu dari state form, bukan dari default DOM). */
export function ColorInput({
  id,
  value,
  onChange,
  fallback = '#3b82f6',
  className,
}: {
  id: string;
  value: string | null | undefined;
  onChange: (value: string) => void;
  fallback?: string;
  className?: string;
}) {
  return (
    <input
      id={id}
      type="color"
      value={value || fallback}
      onChange={(e) => onChange(e.target.value)}
      className={cn(fieldClass, 'h-10 w-16 p-1', className)}
    />
  );
}
