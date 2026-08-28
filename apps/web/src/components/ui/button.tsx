import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'md' | 'lg';

/* Прямые углы, верхний регистр, широкий трекинг — язык референса.
   Скруглений нет нигде: это несущий признак жанра, а не деталь. */
const base =
  'group relative inline-flex cursor-pointer items-center justify-center gap-3 ' +
  'text-[0.6875rem] font-medium tracking-[0.18em] uppercase ' +
  'transition-[background-color,color,border-color] duration-500 ' +
  'ease-[cubic-bezier(0.22,1,0.36,1)] ' +
  'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink ' +
  'disabled:pointer-events-none disabled:opacity-40';

const variants: Record<Variant, string> = {
  primary: 'bg-ink text-bg hover:bg-ink-soft',
  secondary: 'border border-line-strong text-ink hover:border-ink hover:bg-ink hover:text-bg',
  ghost: 'text-muted hover:text-ink',
};

const sizes: Record<Size, string> = {
  md: 'px-7 py-3.5',
  lg: 'px-10 py-5',
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
  const cls = `${base} ${variants[variant]} ${variant === 'ghost' ? '' : sizes[size]} ${className}`;

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
