import type { ProgramStep } from '@tver/shared';
import { Reveal } from '@/components/motion/reveal';
import { ClockIcon } from '@/components/ui/icons';

export function ProgramTimeline({ steps }: { steps: ProgramStep[] }) {
  if (steps.length === 0) return null;

  return (
    <ol className="relative space-y-8">
      <span
        className="bg-sand-300 absolute top-2 bottom-2 left-[1.05rem] w-px"
        aria-hidden
      />
      {steps.map((step, i) => (
        <Reveal key={`${step.title}-${i}`} delay={i * 0.05}>
          <li className="relative flex gap-5">
            <span className="bg-terra-500 shadow-card relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white">
              {i + 1}
            </span>
            <div className="pt-1">
              <h3 className="text-ink-900 flex flex-wrap items-center gap-3 font-bold">
                {step.title}
                {step.durationMinutes ? (
                  <span className="bg-cream-200 text-bark-700 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold">
                    <ClockIcon className="h-3.5 w-3.5" /> {step.durationMinutes} мин
                  </span>
                ) : null}
              </h3>
              {step.description ? (
                <p className="text-bark-700 mt-1.5 text-sm leading-relaxed">{step.description}</p>
              ) : null}
            </div>
          </li>
        </Reveal>
      ))}
    </ol>
  );
}
