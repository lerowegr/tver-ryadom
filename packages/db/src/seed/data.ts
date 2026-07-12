import type { ProgramStep, RoutePointInput } from '@tver/shared';

/**
 * Демо-данные по мотивам референса tour-tver.erg-gromov.workers.dev.
 * Координаты точек маршрута — ориентировочные, уточняются контент-менеджером.
 */

export interface SeedTour {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  shortDescription: string;
  fullDescription: string;
  program: ProgramStep[];
  price: number;
  priceType: 'per_person' | 'per_group';
  durationMinutes: number;
  groupMin: number;
  groupMax: number | null;
  meetingPoint: string;
  meetingLat: number;
  meetingLng: number;
  included: string[];
  notIncluded: string[];
  recommendations: string;
  badgeSlugs: string[];
  routePoints: (RoutePointInput & { id: string })[];
  sortOrder: number;
}

export const seedTours: SeedTour[] = [
  {
    id: 'tour-obzornaya',
    slug: 'obzornaya-po-tveri',
    title: 'Обзорная экскурсия по Твери',
    subtitle: 'Пешеходная прогулка по историческому центру',
    shortDescription:
      'Полтора часа неспешной прогулки по сердцу Твери: путевой дворец, набережные Волги, купеческие улицы и городские легенды — спокойно, живо и без скучной лекции.',
    fullDescription:
      'Тверь стоит между двумя столицами, и в этом её характер: имперский размах и уездное обаяние. ' +
      'Мы пройдём от Императорского путевого дворца через городской сад к Волге, перейдём Староволжский мост, ' +
      'поздороваемся с Афанасием Никитиным и вернёмся по набережной Степана Разина к пешеходной Трёхсвятской. ' +
      'По дороге — истории о тверских князьях, екатерининской перепланировке, пожаре 1763 года и о том, ' +
      'как живёт город сегодня. Маршрут подходит для первого знакомства с городом.',
    program: [
      {
        title: 'Императорский путевой дворец',
        description: 'Встреча у дворца, история резиденции Екатерины II и тверского кремля.',
        durationMinutes: 20,
      },
      {
        title: 'Городской сад и набережная Михаила Ярославича',
        description: 'Виды на Волгу, памятник Михаилу Тверскому, история речных ворот города.',
        durationMinutes: 20,
      },
      {
        title: 'Староволжский мост и Заволжье',
        description: 'Самый узнаваемый мост Твери и памятник Афанасию Никитину.',
        durationMinutes: 25,
      },
      {
        title: 'Набережная Степана Разина и Трёхсвятская',
        description: 'Купеческая застройка «единою фасадою» и главная пешеходная улица.',
        durationMinutes: 25,
      },
    ],
    price: 120000,
    priceType: 'per_person',
    durationMinutes: 90,
    groupMin: 1,
    groupMax: 15,
    meetingPoint: 'У главного входа Императорского путевого дворца, ул. Советская, 3',
    meetingLat: 56.8626,
    meetingLng: 35.8988,
    included: ['Сопровождение гида', 'Авторский маршрут', 'Ответы на любые вопросы о городе'],
    notIncluded: ['Входные билеты в музеи', 'Питание и напитки'],
    recommendations:
      'Наденьте удобную обувь — идём около 4 км. В дождь возьмите зонт: маршрут полностью уличный.',
    badgeSlugs: ['hit', 'first-visit', 'walking', 'popular'],
    routePoints: [
      { id: 'rp-obz-1', title: 'Императорский путевой дворец', lat: 56.8626, lng: 35.8988 },
      { id: 'rp-obz-2', title: 'Городской сад', lat: 56.8639, lng: 35.9009 },
      { id: 'rp-obz-3', title: 'Староволжский мост', lat: 56.8646, lng: 35.9032 },
      { id: 'rp-obz-4', title: 'Памятник Афанасию Никитину', lat: 56.8664, lng: 35.9042 },
      { id: 'rp-obz-5', title: 'Набережная Степана Разина', lat: 56.8637, lng: 35.9092 },
      { id: 'rp-obz-6', title: 'Трёхсвятская улица', lat: 56.8563, lng: 35.9105 },
    ],
    sortOrder: 1,
  },
  {
    id: 'tour-savvatevo',
    slug: 'savvatevo-na-avto',
    title: 'Савватьево на авто',
    subtitle: 'Автопутешествие к древней пустыни на берегу Орши',
    shortDescription:
      'За 3–4 часа доезжаем до села Савватьево: монастырская история XIV века, святой источник, тихие берега Орши и рассказ о том, чем жила тверская глубинка.',
    fullDescription:
      'Савватьева пустынь — одно из самых атмосферных мест Тверской округи. Когда-то здесь была пещера ' +
      'отшельника Савватия, потом — монастырь, к которому шли паломники со всей России. ' +
      'Мы едем на автомобиле из центра Твери, по дороге разговариваем о судьбе пригородных сёл, ' +
      'гуляем у восстановленного храма, спускаемся к святому источнику и слушаем тишину на берегу Орши. ' +
      'Формат камерный: группа до 4 человек, поездка в удобном темпе с остановками для фотографий.',
    program: [
      {
        title: 'Выезд из Твери',
        description: 'Забираем вас в центре города, по дороге — рассказ об окрестностях.',
        durationMinutes: 40,
      },
      {
        title: 'Савватьева пустынь',
        description: 'История монастыря XIV века, храм и монастырская жизнь сегодня.',
        durationMinutes: 60,
      },
      {
        title: 'Святой источник и берег Орши',
        description: 'Прогулка к источнику, чай из термоса, время для фотографий.',
        durationMinutes: 60,
      },
      {
        title: 'Возвращение в Тверь',
        description: 'Обратная дорога с ответами на вопросы.',
        durationMinutes: 40,
      },
    ],
    price: 600000,
    priceType: 'per_group',
    durationMinutes: 210,
    groupMin: 1,
    groupMax: 4,
    meetingPoint: 'Заберём от вашего отеля или от Императорского путевого дворца',
    meetingLat: 56.8626,
    meetingLng: 35.8988,
    included: ['Автомобиль и топливо', 'Сопровождение гида', 'Горячий чай в дорогу'],
    notIncluded: ['Обед', 'Личные расходы'],
    recommendations:
      'Возьмите куртку — у воды прохладнее, чем в городе. Для источника пригодится пустая бутылка.',
    badgeSlugs: ['by-car', 'author-route'],
    routePoints: [
      { id: 'rp-sav-1', title: 'Выезд из центра Твери', lat: 56.8626, lng: 35.8988 },
      { id: 'rp-sav-2', title: 'Село Савватьево', lat: 56.87, lng: 36.09 },
      { id: 'rp-sav-3', title: 'Святой источник', lat: 56.872, lng: 36.095 },
    ],
    sortOrder: 2,
  },
  {
    id: 'tour-predmeste',
    slug: 'predmeste-tveri',
    title: 'Предместье Твери',
    subtitle: 'Авторский маршрут по Затьмачью',
    shortDescription:
      'Полтора часа в стороне от парадных фасадов: деревянное Затьмачье, старейший храм города Белая Троица и истории людей, которые здесь жили.',
    fullDescription:
      'Затьмачье — район за рекой Тьмакой, куда редко доходят туристы. Здесь сохранилась деревянная Тверь: ' +
      'резные наличники, тихие дворы, старейшее здание города — храм Белой Троицы XVI века. ' +
      'Это маршрут про повседневную жизнь города: ремесленные слободы, наводнения, соседские истории ' +
      'и то, как предместье становится модным районом. Авторская подача без дат ради дат — ' +
      'только живые сюжеты и места, которые вы не найдёте в путеводителях.',
    program: [
      {
        title: 'Мост через Тьмаку',
        description: 'Граница парадной и ремесленной Твери, история района.',
        durationMinutes: 15,
      },
      {
        title: 'Белая Троица',
        description: 'Старейшее здание Твери (1564 год) и его легенды.',
        durationMinutes: 30,
      },
      {
        title: 'Деревянное Затьмачье',
        description: 'Резные дома, дворы и их жители — прошлые и нынешние.',
        durationMinutes: 30,
      },
      {
        title: 'Христорождественский монастырь',
        description: 'Финальная точка маршрута и панорама Тьмаки.',
        durationMinutes: 15,
      },
    ],
    price: 100000,
    priceType: 'per_person',
    durationMinutes: 90,
    groupMin: 1,
    groupMax: 10,
    meetingPoint: 'У моста через Тьмаку со стороны Советской улицы',
    meetingLat: 56.8585,
    meetingLng: 35.8945,
    included: ['Сопровождение гида', 'Авторский маршрут вне туристических троп'],
    notIncluded: ['Пожертвования в храмах'],
    recommendations:
      'Маршрут проходит по действующим храмам — при желании зайти внутрь возьмите платок.',
    badgeSlugs: ['author-route', 'historical', 'walking'],
    routePoints: [
      { id: 'rp-pre-1', title: 'Мост через Тьмаку', lat: 56.8585, lng: 35.8945 },
      { id: 'rp-pre-2', title: 'Храм Белой Троицы', lat: 56.8557, lng: 35.8983 },
      { id: 'rp-pre-3', title: 'Деревянное Затьмачье', lat: 56.8535, lng: 35.8925 },
      { id: 'rp-pre-4', title: 'Христорождественский монастырь', lat: 56.8477, lng: 35.8867 },
    ],
    sortOrder: 3,
  },
];

export interface SeedReview {
  id: string;
  tourId: string;
  authorName: string;
  rating: number;
  text: string;
}

export const seedReviews: SeedReview[] = [
  {
    id: 'review-1',
    tourId: 'tour-obzornaya',
    authorName: 'Мария',
    rating: 5,
    text: 'Полтора часа пролетели незаметно. Никакой скучной лекции — живой рассказ, много неожиданных деталей о городе. Тверь после экскурсии видится совсем иначе!',
  },
  {
    id: 'review-2',
    tourId: 'tour-obzornaya',
    authorName: 'Дмитрий',
    rating: 5,
    text: 'Были проездом из Москвы, взяли обзорную. Отличный маршрут: и дворец, и набережные, и мост. Гид отвечал на любые вопросы, посоветовал где пообедать.',
  },
  {
    id: 'review-3',
    tourId: 'tour-savvatevo',
    authorName: 'Елена',
    rating: 5,
    text: 'Ездили в Савватьево вдвоём с мужем. Очень душевная поездка: источник, тишина, рассказы о монастыре. Чай из термоса на берегу Орши — отдельное удовольствие.',
  },
  {
    id: 'review-4',
    tourId: 'tour-predmeste',
    authorName: 'Алексей',
    rating: 4,
    text: 'Необычный маршрут по Затьмачью — я тверской, но половину историй услышал впервые. Белая Троица впечатляет. Четыре звезды только из-за погоды.',
  },
  {
    id: 'review-5',
    tourId: 'tour-predmeste',
    authorName: 'Ольга',
    rating: 5,
    text: 'Люблю такие «нетуристические» прогулки. Деревянные дома с наличниками, дворики, личные истории жителей — видно, что маршрут собран с любовью.',
  },
];

/** Настройки сайта: значения — JSON-строки. */
export const seedSettings: Record<string, unknown> = {
  'contacts.phone': '+79000000000',
  'contacts.email': 'hello@tver-ryadom.ru',
  'contacts.telegram': 'https://t.me/tver_ryadom',
  'contacts.whatsapp': 'https://wa.me/79000000000',
  'contacts.vk': 'https://vk.com/tver_ryadom',
  'company.name': 'Тверь рядом',
  'company.tagline': 'Покажем Тверь спокойно, живо и без скучной лекции',
};
