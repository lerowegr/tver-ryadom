import { Reveal } from '@/components/motion/reveal';

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = 'left',
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: 'left' | 'center';
}) {
  const alignCls = align === 'center' ? 'text-center [&_.heading-accent]:after:mx-auto' : '';
  return (
    <Reveal className={`mb-10 max-w-2xl md:mb-14 ${align === 'center' ? 'mx-auto' : ''} ${alignCls}`}>
      {eyebrow ? (
        <p className="text-terra-600 mb-3 text-sm font-semibold tracking-widest uppercase">{eyebrow}</p>
      ) : null}
      <h2 className="font-display heading-accent text-ink-900 text-3xl leading-tight font-semibold text-balance md:text-4xl">
        {title}
      </h2>
      {subtitle ? <p className="text-bark-700 mt-5 text-lg leading-relaxed">{subtitle}</p> : null}
    </Reveal>
  );
}
