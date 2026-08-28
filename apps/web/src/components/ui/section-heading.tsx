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
  const centered = align === 'center';
  return (
    <Reveal className={`max-w-2xl ${centered ? 'mx-auto text-center' : ''}`}>
      {eyebrow ? (
        <p className={centered ? 'kicker-plain mb-5' : 'kicker mb-5'}>{eyebrow}</p>
      ) : null}
      <h2 className="display text-[clamp(1.875rem,3.4vw,3rem)]">{title}</h2>
      {subtitle ? (
        <p className={`text-muted mt-6 text-[1.0625rem] leading-[1.75] ${centered ? 'mx-auto' : ''}`}>
          {subtitle}
        </p>
      ) : null}
    </Reveal>
  );
}
