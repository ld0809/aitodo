import type { ButtonHTMLAttributes } from 'react';
import './Button.css';

type ButtonVariant = 'primary' | 'secondary' | 'danger';
type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

function joinClassNames(...values: Array<string | undefined | false | null>) {
  return values.filter(Boolean).join(' ');
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={joinClassNames(
        'ui-button',
        `ui-button--${variant}`,
        size === 'sm' ? 'ui-button--sm' : undefined,
        fullWidth ? 'ui-button--full-width' : undefined,
        className,
      )}
      {...props}
    />
  );
}
