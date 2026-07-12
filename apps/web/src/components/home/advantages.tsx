import { Reveal } from '@/components/motion/reveal';
import { Container } from '@/components/ui/container';
import { HeartIcon, RouteIcon, ShieldIcon, UsersIcon } from '@/components/ui/icons';
import { SectionHeading } from '@/components/ui/section-heading';

const items = [
  {
    icon: RouteIcon,
    title: 'Авторские маршруты',
    text: 'Не пересказываем путеводители: каждый маршрут собран из личных находок, архивов и разговоров с местными.',
  },
  {
    icon: UsersIcon,
    title: 'Небольшие группы',
    text: 'До 15 человек на прогулке и до 4 — в автопутешествии. Всем слышно, всем видно, каждому — внимание.',
  },
  {
    icon: HeartIcon,
    title: 'Живой рассказ',
    text: 'Без дат ради дат и монотонных лекций. Истории людей, городские легенды и место для ваших вопросов.',
  },
  {
    icon: ShieldIcon,
    title: 'Просто и надёжно',
    text: 'Бронирование за минуту, подтверждение и напоминание накануне. Если планы изменились — перенесём.',
  },
];

export function Advantages() {
  return (
    <section className="py-20 md:py-28">
      <Container>
        <SectionHeading
          eyebrow="Почему с нами"
          title="Экскурсии, после которых город становится своим"
          subtitle="Мы живём в Твери и любим её не по должности. Это чувствуется в каждой прогулке."
        />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item, i) => (
            <Reveal key={item.title} delay={i * 0.08}>
              <div className="glass shadow-card h-full rounded-3xl p-7 transition-transform duration-300 hover:-translate-y-1">
                <div className="bg-terra-500/10 text-terra-600 mb-5 inline-flex rounded-2xl p-3">
                  <item.icon className="h-6 w-6" />
                </div>
                <h3 className="text-ink-900 mb-2 text-lg font-bold">{item.title}</h3>
                <p className="text-bark-700 text-sm leading-relaxed">{item.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
