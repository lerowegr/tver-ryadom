import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-200 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra-500 ' +
  'disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]';

const variants: Record<Variant, string> = {
  primary: 'bg-terra-500 text-white shadow-soft hover:bg-terra-600',
  secondary: 'border border-bark-600/30 bg-white/70 text-bark-800 hover:border-bark-600/60 hover:bg-white',
  ghost: 'text-bark-700 hover:bg-bark-600/10',
};

const sizes: Record<Size, string> = {
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-7 py-3.5 text-base',
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}

type ButtonAsButton = CommonProps & ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
type ButtonAsLink = CommonProps & { href: string };

export function Button(props: ButtonAsButton | ButtonAsLink) {
  const { variant = 'primary', size = 'md', className = '', children } = props;
  const cls = `${base} ${variants[variant]} ${sizes[size]} ${className}`;

  if ('href' in props && props.href !== undefined) {
    return (
      <Link href={props.href} className={cls}>
        {children}
      </Link>
    );
  }

  const { variant: _v, size: _s, className: _c, children: _ch, ...rest } = props as ButtonAsButton;
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}
