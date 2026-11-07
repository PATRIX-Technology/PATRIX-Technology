import type { Nationality } from '@/types/database';

/** Covers every UN member state plus a small number of widely-recognized
 * non-UN territories (Taiwan, Kosovo, Palestine), deliberately excluding
 * only Israel per explicit founder instruction. Grouped by region purely
 * for human readability in this file -- the dropdown itself sorts Gulf
 * nationalities first (see NATIONALITY_OPTIONS below), since that's the
 * platform's primary UAE nursery audience, then the rest alphabetically
 * by English label. 'other' remains the explicit catch-all for anything
 * genuinely missing. See docs/DECISIONS.md "Nationality list expanded to
 * (nearly) every country". */
const GULF_FIRST: { value: Nationality; labelEn: string; labelAr: string }[] = [
  { value: 'emirati', labelEn: 'Emirati', labelAr: 'إماراتي' },
  { value: 'saudi', labelEn: 'Saudi', labelAr: 'سعودي' },
  { value: 'kuwaiti', labelEn: 'Kuwaiti', labelAr: 'كويتي' },
  { value: 'qatari', labelEn: 'Qatari', labelAr: 'قطري' },
  { value: 'bahraini', labelEn: 'Bahraini', labelAr: 'بحريني' },
  { value: 'omani', labelEn: 'Omani', labelAr: 'عماني' },
];

const REST_OF_WORLD: { value: Nationality; labelEn: string; labelAr: string }[] = [
  // Middle East / North Africa (non-Gulf)
  { value: 'egyptian', labelEn: 'Egyptian', labelAr: 'مصري' },
  { value: 'jordanian', labelEn: 'Jordanian', labelAr: 'أردني' },
  { value: 'lebanese', labelEn: 'Lebanese', labelAr: 'لبناني' },
  { value: 'syrian', labelEn: 'Syrian', labelAr: 'سوري' },
  { value: 'palestinian', labelEn: 'Palestinian', labelAr: 'فلسطيني' },
  { value: 'iraqi', labelEn: 'Iraqi', labelAr: 'عراقي' },
  { value: 'iranian', labelEn: 'Iranian', labelAr: 'إيراني' },
  { value: 'turkish', labelEn: 'Turkish', labelAr: 'تركي' },
  { value: 'yemeni', labelEn: 'Yemeni', labelAr: 'يمني' },
  { value: 'moroccan', labelEn: 'Moroccan', labelAr: 'مغربي' },
  { value: 'algerian', labelEn: 'Algerian', labelAr: 'جزائري' },
  { value: 'tunisian', labelEn: 'Tunisian', labelAr: 'تونسي' },
  { value: 'libyan', labelEn: 'Libyan', labelAr: 'ليبي' },
  { value: 'sudanese', labelEn: 'Sudanese', labelAr: 'سوداني' },
  { value: 'mauritanian', labelEn: 'Mauritanian', labelAr: 'موريتاني' },

  // South & Central Asia
  { value: 'indian', labelEn: 'Indian', labelAr: 'هندي' },
  { value: 'pakistani', labelEn: 'Pakistani', labelAr: 'باكستاني' },
  { value: 'bangladeshi', labelEn: 'Bangladeshi', labelAr: 'بنغلاديشي' },
  { value: 'afghan', labelEn: 'Afghan', labelAr: 'أفغاني' },
  { value: 'sri_lankan', labelEn: 'Sri Lankan', labelAr: 'سريلانكي' },
  { value: 'nepali', labelEn: 'Nepali', labelAr: 'نيبالي' },
  { value: 'bhutanese', labelEn: 'Bhutanese', labelAr: 'بوتاني' },
  { value: 'maldivian', labelEn: 'Maldivian', labelAr: 'مالديفي' },
  { value: 'kazakh', labelEn: 'Kazakh', labelAr: 'كازاخستاني' },
  { value: 'uzbek', labelEn: 'Uzbek', labelAr: 'أوزبكستاني' },
  { value: 'turkmen', labelEn: 'Turkmen', labelAr: 'تركمانستاني' },
  { value: 'kyrgyz', labelEn: 'Kyrgyz', labelAr: 'قيرغيزستاني' },
  { value: 'tajik', labelEn: 'Tajik', labelAr: 'طاجيكستاني' },
  { value: 'azerbaijani', labelEn: 'Azerbaijani', labelAr: 'أذربيجاني' },
  { value: 'georgian', labelEn: 'Georgian', labelAr: 'جورجي' },
  { value: 'armenian', labelEn: 'Armenian', labelAr: 'أرميني' },

  // East & Southeast Asia
  { value: 'filipino', labelEn: 'Filipino', labelAr: 'فلبيني' },
  { value: 'chinese', labelEn: 'Chinese', labelAr: 'صيني' },
  { value: 'taiwanese', labelEn: 'Taiwanese', labelAr: 'تايواني' },
  { value: 'japanese', labelEn: 'Japanese', labelAr: 'ياباني' },
  { value: 'south_korean', labelEn: 'South Korean', labelAr: 'كوري جنوبي' },
  { value: 'north_korean', labelEn: 'North Korean', labelAr: 'كوري شمالي' },
  { value: 'mongolian', labelEn: 'Mongolian', labelAr: 'منغولي' },
  { value: 'thai', labelEn: 'Thai', labelAr: 'تايلاندي' },
  { value: 'vietnamese', labelEn: 'Vietnamese', labelAr: 'فيتنامي' },
  { value: 'cambodian', labelEn: 'Cambodian', labelAr: 'كمبودي' },
  { value: 'laotian', labelEn: 'Laotian', labelAr: 'لاوسي' },
  { value: 'burmese', labelEn: 'Burmese (Myanmar)', labelAr: 'بورمي (ميانمار)' },
  { value: 'malaysian', labelEn: 'Malaysian', labelAr: 'ماليزي' },
  { value: 'singaporean', labelEn: 'Singaporean', labelAr: 'سنغافوري' },
  { value: 'indonesian', labelEn: 'Indonesian', labelAr: 'إندونيسي' },
  { value: 'bruneian', labelEn: 'Bruneian', labelAr: 'بروناي' },
  { value: 'east_timorese', labelEn: 'East Timorese', labelAr: 'تيموري' },

  // Europe
  { value: 'british', labelEn: 'British', labelAr: 'بريطاني' },
  { value: 'irish', labelEn: 'Irish', labelAr: 'أيرلندي' },
  { value: 'french', labelEn: 'French', labelAr: 'فرنسي' },
  { value: 'german', labelEn: 'German', labelAr: 'ألماني' },
  { value: 'spanish', labelEn: 'Spanish', labelAr: 'إسباني' },
  { value: 'portuguese', labelEn: 'Portuguese', labelAr: 'برتغالي' },
  { value: 'italian', labelEn: 'Italian', labelAr: 'إيطالي' },
  { value: 'dutch', labelEn: 'Dutch', labelAr: 'هولندي' },
  { value: 'belgian', labelEn: 'Belgian', labelAr: 'بلجيكي' },
  { value: 'swiss', labelEn: 'Swiss', labelAr: 'سويسري' },
  { value: 'austrian', labelEn: 'Austrian', labelAr: 'نمساوي' },
  { value: 'swedish', labelEn: 'Swedish', labelAr: 'سويدي' },
  { value: 'norwegian', labelEn: 'Norwegian', labelAr: 'نرويجي' },
  { value: 'danish', labelEn: 'Danish', labelAr: 'دنماركي' },
  { value: 'finnish', labelEn: 'Finnish', labelAr: 'فنلندي' },
  { value: 'icelandic', labelEn: 'Icelandic', labelAr: 'أيسلندي' },
  { value: 'polish', labelEn: 'Polish', labelAr: 'بولندي' },
  { value: 'czech', labelEn: 'Czech', labelAr: 'تشيكي' },
  { value: 'slovak', labelEn: 'Slovak', labelAr: 'سلوفاكي' },
  { value: 'hungarian', labelEn: 'Hungarian', labelAr: 'مجري' },
  { value: 'romanian', labelEn: 'Romanian', labelAr: 'روماني' },
  { value: 'bulgarian', labelEn: 'Bulgarian', labelAr: 'بلغاري' },
  { value: 'greek', labelEn: 'Greek', labelAr: 'يوناني' },
  { value: 'croatian', labelEn: 'Croatian', labelAr: 'كرواتي' },
  { value: 'serbian', labelEn: 'Serbian', labelAr: 'صربي' },
  { value: 'bosnian', labelEn: 'Bosnian', labelAr: 'بوسني' },
  { value: 'slovenian', labelEn: 'Slovenian', labelAr: 'سلوفيني' },
  { value: 'albanian', labelEn: 'Albanian', labelAr: 'ألباني' },
  { value: 'macedonian', labelEn: 'Macedonian', labelAr: 'مقدوني' },
  { value: 'montenegrin', labelEn: 'Montenegrin', labelAr: 'مونتينيغري' },
  { value: 'kosovar', labelEn: 'Kosovar', labelAr: 'كوسوفي' },
  { value: 'moldovan', labelEn: 'Moldovan', labelAr: 'مولدوفي' },
  { value: 'ukrainian', labelEn: 'Ukrainian', labelAr: 'أوكراني' },
  { value: 'belarusian', labelEn: 'Belarusian', labelAr: 'بيلاروسي' },
  { value: 'russian', labelEn: 'Russian', labelAr: 'روسي' },
  { value: 'lithuanian', labelEn: 'Lithuanian', labelAr: 'ليتواني' },
  { value: 'latvian', labelEn: 'Latvian', labelAr: 'لاتفي' },
  { value: 'estonian', labelEn: 'Estonian', labelAr: 'إستوني' },
  { value: 'luxembourgish', labelEn: 'Luxembourgish', labelAr: 'لوكسمبورغي' },
  { value: 'maltese', labelEn: 'Maltese', labelAr: 'مالطي' },
  { value: 'cypriot', labelEn: 'Cypriot', labelAr: 'قبرصي' },
  { value: 'monacan', labelEn: 'Monacan', labelAr: 'موناكي' },
  { value: 'liechtensteiner', labelEn: 'Liechtensteiner', labelAr: 'ليختنشتايني' },
  { value: 'san_marinese', labelEn: 'San Marinese', labelAr: 'سان ماريني' },
  { value: 'andorran', labelEn: 'Andorran', labelAr: 'أندوري' },

  // Sub-Saharan & North-East Africa (non-MENA)
  { value: 'nigerian', labelEn: 'Nigerian', labelAr: 'نيجيري' },
  { value: 'nigerien', labelEn: 'Nigerien (Niger)', labelAr: 'نيجري (النيجر)' },
  { value: 'chadian', labelEn: 'Chadian', labelAr: 'تشادي' },
  { value: 'senegalese', labelEn: 'Senegalese', labelAr: 'سنغالي' },
  { value: 'gambian', labelEn: 'Gambian', labelAr: 'غامبي' },
  { value: 'guinean', labelEn: 'Guinean', labelAr: 'غيني' },
  { value: 'guinea_bissauan', labelEn: 'Guinea-Bissauan', labelAr: 'غيني بيساوي' },
  { value: 'sierra_leonean', labelEn: 'Sierra Leonean', labelAr: 'سيراليوني' },
  { value: 'liberian', labelEn: 'Liberian', labelAr: 'ليبيري' },
  { value: 'ivorian', labelEn: 'Ivorian', labelAr: 'إيفواري' },
  { value: 'ghanaian', labelEn: 'Ghanaian', labelAr: 'غاني' },
  { value: 'togolese', labelEn: 'Togolese', labelAr: 'توغولي' },
  { value: 'beninese', labelEn: 'Beninese', labelAr: 'بنيني' },
  { value: 'cameroonian', labelEn: 'Cameroonian', labelAr: 'كاميروني' },
  { value: 'central_african', labelEn: 'Central African', labelAr: 'أفريقي أواسط' },
  { value: 'equatorial_guinean', labelEn: 'Equatorial Guinean', labelAr: 'غيني استوائي' },
  { value: 'gabonese', labelEn: 'Gabonese', labelAr: 'غابوني' },
  { value: 'congolese_brazzaville', labelEn: 'Congolese (Congo-Brazzaville)', labelAr: 'كونغولي (برازافيل)' },
  { value: 'congolese_kinshasa', labelEn: 'Congolese (DR Congo)', labelAr: 'كونغولي (الكونغو الديمقراطية)' },
  { value: 'angolan', labelEn: 'Angolan', labelAr: 'أنغولي' },
  { value: 'zambian', labelEn: 'Zambian', labelAr: 'زامبي' },
  { value: 'malawian', labelEn: 'Malawian', labelAr: 'ملاوي' },
  { value: 'mozambican', labelEn: 'Mozambican', labelAr: 'موزمبيقي' },
  { value: 'zimbabwean', labelEn: 'Zimbabwean', labelAr: 'زيمبابوي' },
  { value: 'botswanan', labelEn: 'Botswanan', labelAr: 'بوتسواني' },
  { value: 'namibian', labelEn: 'Namibian', labelAr: 'ناميبي' },
  { value: 'basotho', labelEn: 'Basotho (Lesotho)', labelAr: 'ليسوتي' },
  { value: 'swazi', labelEn: 'Swazi (Eswatini)', labelAr: 'سوازي (إسواتيني)' },
  { value: 'kenyan', labelEn: 'Kenyan', labelAr: 'كيني' },
  { value: 'ugandan', labelEn: 'Ugandan', labelAr: 'أوغندي' },
  { value: 'tanzanian', labelEn: 'Tanzanian', labelAr: 'تنزاني' },
  { value: 'rwandan', labelEn: 'Rwandan', labelAr: 'رواندي' },
  { value: 'burundian', labelEn: 'Burundian', labelAr: 'بوروندي' },
  { value: 'somali', labelEn: 'Somali', labelAr: 'صومالي' },
  { value: 'djiboutian', labelEn: 'Djiboutian', labelAr: 'جيبوتي' },
  { value: 'eritrean', labelEn: 'Eritrean', labelAr: 'إريتري' },
  { value: 'ethiopian', labelEn: 'Ethiopian', labelAr: 'إثيوبي' },
  { value: 'south_sudanese', labelEn: 'South Sudanese', labelAr: 'جنوب سوداني' },
  { value: 'cape_verdean', labelEn: 'Cape Verdean', labelAr: 'الرأس الأخضر' },
  { value: 'sao_tomean', labelEn: 'São Toméan', labelAr: 'ساو تومي' },
  { value: 'comorian', labelEn: 'Comorian', labelAr: 'قمري' },
  { value: 'mauritian', labelEn: 'Mauritian', labelAr: 'موريشيوسي' },
  { value: 'seychellois', labelEn: 'Seychellois', labelAr: 'سيشيلي' },
  { value: 'malagasy', labelEn: 'Malagasy (Madagascar)', labelAr: 'مدغشقري' },
  { value: 'burkinabe', labelEn: 'Burkinabé', labelAr: 'بوركينابي' },
  { value: 'malian', labelEn: 'Malian', labelAr: 'مالي' },
  { value: 'south_african', labelEn: 'South African', labelAr: 'جنوب أفريقي' },

  // Americas
  { value: 'american', labelEn: 'American', labelAr: 'أمريكي' },
  { value: 'canadian', labelEn: 'Canadian', labelAr: 'كندي' },
  { value: 'mexican', labelEn: 'Mexican', labelAr: 'مكسيكي' },
  { value: 'guatemalan', labelEn: 'Guatemalan', labelAr: 'غواتيمالي' },
  { value: 'belizean', labelEn: 'Belizean', labelAr: 'بليزي' },
  { value: 'honduran', labelEn: 'Honduran', labelAr: 'هندوراسي' },
  { value: 'salvadoran', labelEn: 'Salvadoran', labelAr: 'سلفادوري' },
  { value: 'nicaraguan', labelEn: 'Nicaraguan', labelAr: 'نيكاراغوي' },
  { value: 'costa_rican', labelEn: 'Costa Rican', labelAr: 'كوستاريكي' },
  { value: 'panamanian', labelEn: 'Panamanian', labelAr: 'بنمي' },
  { value: 'cuban', labelEn: 'Cuban', labelAr: 'كوبي' },
  { value: 'jamaican', labelEn: 'Jamaican', labelAr: 'جامايكي' },
  { value: 'haitian', labelEn: 'Haitian', labelAr: 'هايتي' },
  { value: 'dominican_republic', labelEn: 'Dominican (Dominican Republic)', labelAr: 'دومينيكاني (جمهورية الدومينيكان)' },
  { value: 'dominica_island', labelEn: 'Dominican (Dominica)', labelAr: 'دومينيكي (دومينيكا)' },
  { value: 'bahamian', labelEn: 'Bahamian', labelAr: 'باهامي' },
  { value: 'barbadian', labelEn: 'Barbadian', labelAr: 'باربادوسي' },
  { value: 'trinidadian', labelEn: 'Trinidadian and Tobagonian', labelAr: 'ترينيدادي' },
  { value: 'grenadian', labelEn: 'Grenadian', labelAr: 'غرينادي' },
  { value: 'vincentian', labelEn: 'Vincentian (St Vincent)', labelAr: 'فينسنتي' },
  { value: 'saint_lucian', labelEn: 'Saint Lucian', labelAr: 'سانت لوشي' },
  { value: 'antiguan', labelEn: 'Antiguan and Barbudan', labelAr: 'أنتيغوي' },
  { value: 'kittitian', labelEn: 'Kittitian and Nevisian (St Kitts)', labelAr: 'سانت كيتسي' },
  { value: 'brazilian', labelEn: 'Brazilian', labelAr: 'برازيلي' },
  { value: 'argentine', labelEn: 'Argentine', labelAr: 'أرجنتيني' },
  { value: 'chilean', labelEn: 'Chilean', labelAr: 'تشيلي' },
  { value: 'uruguayan', labelEn: 'Uruguayan', labelAr: 'أوروغواياني' },
  { value: 'paraguayan', labelEn: 'Paraguayan', labelAr: 'باراغواياني' },
  { value: 'bolivian', labelEn: 'Bolivian', labelAr: 'بوليفي' },
  { value: 'peruvian', labelEn: 'Peruvian', labelAr: 'بيروفي' },
  { value: 'ecuadorian', labelEn: 'Ecuadorian', labelAr: 'إكوادوري' },
  { value: 'colombian', labelEn: 'Colombian', labelAr: 'كولومبي' },
  { value: 'venezuelan', labelEn: 'Venezuelan', labelAr: 'فنزويلي' },
  { value: 'guyanese', labelEn: 'Guyanese', labelAr: 'غياني' },
  { value: 'surinamese', labelEn: 'Surinamese', labelAr: 'سورينامي' },

  // Oceania
  { value: 'australian', labelEn: 'Australian', labelAr: 'أسترالي' },
  { value: 'new_zealander', labelEn: 'New Zealander', labelAr: 'نيوزيلندي' },
  { value: 'fijian', labelEn: 'Fijian', labelAr: 'فيجي' },
  { value: 'papua_new_guinean', labelEn: 'Papua New Guinean', labelAr: 'بابوا غيني' },
  { value: 'solomon_islander', labelEn: 'Solomon Islander', labelAr: 'جزر سليمان' },
  { value: 'vanuatuan', labelEn: 'Vanuatuan', labelAr: 'فانواتو' },
  { value: 'samoan', labelEn: 'Samoan', labelAr: 'ساموا' },
  { value: 'tongan', labelEn: 'Tongan', labelAr: 'تونغا' },
  { value: 'kiribati', labelEn: 'I-Kiribati', labelAr: 'كيريباتي' },
  { value: 'tuvaluan', labelEn: 'Tuvaluan', labelAr: 'توفالو' },
  { value: 'nauruan', labelEn: 'Nauruan', labelAr: 'ناورو' },
  { value: 'palauan', labelEn: 'Palauan', labelAr: 'بالاو' },
  { value: 'marshallese', labelEn: 'Marshallese', labelAr: 'جزر مارشال' },
  { value: 'micronesian', labelEn: 'Micronesian', labelAr: 'ميكرونيزي' },

  { value: 'other', labelEn: 'Other', labelAr: 'أخرى' },
];

export const NATIONALITY_OPTIONS: { value: Nationality; labelEn: string; labelAr: string }[] = [
  ...GULF_FIRST,
  ...REST_OF_WORLD,
];

const NATIONALITY_VALUES = new Set(NATIONALITY_OPTIONS.map((o) => o.value));

export function isNationality(value: unknown): value is Nationality {
  return typeof value === 'string' && NATIONALITY_VALUES.has(value as Nationality);
}

/** Loose CSV-cell matching -- same convenience-alias approach as
 * normalizePronoun/normalizeLanguage in children.ts, not a strict ISO
 * code lookup, since a nursery's spreadsheet is never going to be
 * pixel-perfect here. Every enum value matches itself (case-insensitive)
 * automatically via the loop below; this map only adds the extra common
 * spellings/country names worth recognizing on top of that. Returns null
 * for anything unrecognized (a row error, like pronoun -- nationality is
 * mandatory, so there's no sensible silent default to fall back to). */
const CSV_ALIASES: Record<string, Nationality> = {
  uae: 'emirati', 'u.a.e': 'emirati', emirates: 'emirati',
  ksa: 'saudi', 'saudi arabia': 'saudi',
  kuwait: 'kuwaiti', qatar: 'qatari', bahrain: 'bahraini', oman: 'omani',
  egypt: 'egyptian', jordan: 'jordanian', lebanon: 'lebanese', syria: 'syrian',
  palestine: 'palestinian', iraq: 'iraqi', iran: 'iranian', turkey: 'turkish', yemen: 'yemeni',
  morocco: 'moroccan', algeria: 'algerian', tunisia: 'tunisian', libya: 'libyan',
  sudan: 'sudanese', mauritania: 'mauritanian',
  india: 'indian', pakistan: 'pakistani', bangladesh: 'bangladeshi', afghanistan: 'afghan',
  'sri lanka': 'sri_lankan', nepal: 'nepali', bhutan: 'bhutanese', maldives: 'maldivian',
  kazakhstan: 'kazakh', uzbekistan: 'uzbek', turkmenistan: 'turkmen', kyrgyzstan: 'kyrgyz',
  tajikistan: 'tajik', azerbaijan: 'azerbaijani', georgia: 'georgian', armenia: 'armenian',
  philippines: 'filipino', china: 'chinese', taiwan: 'taiwanese', japan: 'japanese',
  'south korea': 'south_korean', 'north korea': 'north_korean', mongolia: 'mongolian',
  thailand: 'thai', vietnam: 'vietnamese', cambodia: 'cambodian', laos: 'laotian',
  myanmar: 'burmese', burma: 'burmese', malaysia: 'malaysian', singapore: 'singaporean',
  indonesia: 'indonesian', brunei: 'bruneian', 'east timor': 'east_timorese', 'timor-leste': 'east_timorese',
  uk: 'british', 'united kingdom': 'british', england: 'british',
  ireland: 'irish', france: 'french', germany: 'german', spain: 'spanish', portugal: 'portuguese',
  italy: 'italian', netherlands: 'dutch', holland: 'dutch', belgium: 'belgian', switzerland: 'swiss',
  austria: 'austrian', sweden: 'swedish', norway: 'norwegian', denmark: 'danish', finland: 'finnish',
  iceland: 'icelandic', poland: 'polish', 'czech republic': 'czech', czechia: 'czech', slovakia: 'slovak',
  hungary: 'hungarian', romania: 'romanian', bulgaria: 'bulgarian', greece: 'greek',
  croatia: 'croatian', serbia: 'serbian', bosnia: 'bosnian', slovenia: 'slovenian',
  albania: 'albanian', macedonia: 'macedonian', 'north macedonia': 'macedonian',
  montenegro: 'montenegrin', kosovo: 'kosovar', moldova: 'moldovan', ukraine: 'ukrainian',
  belarus: 'belarusian', russia: 'russian', lithuania: 'lithuanian', latvia: 'latvian',
  estonia: 'estonian', luxembourg: 'luxembourgish', malta: 'maltese', cyprus: 'cypriot',
  monaco: 'monacan', liechtenstein: 'liechtensteiner', 'san marino': 'san_marinese', andorra: 'andorran',
  nigeria: 'nigerian', niger: 'nigerien', chad: 'chadian', senegal: 'senegalese', gambia: 'gambian',
  guinea: 'guinean', 'guinea-bissau': 'guinea_bissauan', 'sierra leone': 'sierra_leonean',
  liberia: 'liberian', 'ivory coast': 'ivorian', "cote d'ivoire": 'ivorian', ghana: 'ghanaian',
  togo: 'togolese', benin: 'beninese', cameroon: 'cameroonian',
  'central african republic': 'central_african', 'equatorial guinea': 'equatorial_guinean',
  gabon: 'gabonese', congo: 'congolese_brazzaville', 'republic of congo': 'congolese_brazzaville',
  'dr congo': 'congolese_kinshasa', 'drc': 'congolese_kinshasa', 'democratic republic of congo': 'congolese_kinshasa',
  angola: 'angolan', zambia: 'zambian', malawi: 'malawian', mozambique: 'mozambican',
  zimbabwe: 'zimbabwean', botswana: 'botswanan', namibia: 'namibian', lesotho: 'basotho',
  eswatini: 'swazi', swaziland: 'swazi', kenya: 'kenyan', uganda: 'ugandan', tanzania: 'tanzanian',
  rwanda: 'rwandan', burundi: 'burundian', somalia: 'somali', djibouti: 'djiboutian',
  eritrea: 'eritrean', ethiopia: 'ethiopian', 'south sudan': 'south_sudanese',
  'cape verde': 'cape_verdean', 'cabo verde': 'cape_verdean', 'sao tome': 'sao_tomean',
  comoros: 'comorian', mauritius: 'mauritian', seychelles: 'seychellois', madagascar: 'malagasy',
  'burkina faso': 'burkinabe', mali: 'malian', 'south africa': 'south_african',
  usa: 'american', us: 'american', 'united states': 'american', canada: 'canadian',
  mexico: 'mexican', guatemala: 'guatemalan', belize: 'belizean', honduras: 'honduran',
  'el salvador': 'salvadoran', nicaragua: 'nicaraguan', 'costa rica': 'costa_rican',
  panama: 'panamanian', cuba: 'cuban', jamaica: 'jamaican', haiti: 'haitian',
  'dominican republic': 'dominican_republic', dominica: 'dominica_island',
  bahamas: 'bahamian', barbados: 'barbadian', trinidad: 'trinidadian', 'trinidad and tobago': 'trinidadian',
  grenada: 'grenadian', 'st vincent': 'vincentian', 'saint vincent': 'vincentian',
  'st lucia': 'saint_lucian', antigua: 'antiguan', 'st kitts': 'kittitian', 'saint kitts': 'kittitian',
  brazil: 'brazilian', argentina: 'argentine', chile: 'chilean', uruguay: 'uruguayan',
  paraguay: 'paraguayan', bolivia: 'bolivian', peru: 'peruvian', ecuador: 'ecuadorian',
  colombia: 'colombian', venezuela: 'venezuelan', guyana: 'guyanese', suriname: 'surinamese',
  australia: 'australian', 'new zealand': 'new_zealander', fiji: 'fijian',
  'papua new guinea': 'papua_new_guinean', 'solomon islands': 'solomon_islander',
  vanuatu: 'vanuatuan', samoa: 'samoan', tonga: 'tongan', kiribati: 'kiribati',
  tuvalu: 'tuvaluan', nauru: 'nauruan', palau: 'palauan', 'marshall islands': 'marshallese',
  micronesia: 'micronesian',
};

export function normalizeNationality(value: string): Nationality | null {
  const v = value.trim().toLowerCase();
  if (v.length === 0) return null;
  if (isNationality(v)) return v;
  if (CSV_ALIASES[v]) return CSV_ALIASES[v];
  const spaced = v.replace(/_/g, ' ');
  const matchByLabel = NATIONALITY_OPTIONS.find((o) => o.labelEn.toLowerCase() === v || o.labelEn.toLowerCase() === spaced);
  return matchByLabel?.value ?? null;
}

const GULF_NATIONALITIES = new Set<Nationality>(['saudi', 'kuwaiti', 'qatari', 'bahraini', 'omani']);

/**
 * Resolves the {family_dress} template token (see renderTokens in
 * templates.ts) -- the one place nationality actually changes what gets
 * illustrated. Deliberately three tiers, not one description per
 * nationality: Emirati keeps the platform's original, most common
 * depiction; other Gulf nationalities get a respectful regional (not
 * country-specific) description rather than guessing at a dress neither
 * accurate nor theirs; every other nationality (all ~185 of them) gets
 * the same neutral, modest, modern-clothing default the illustration
 * prompt already uses everywhere else in the app (see
 * BRAND_STYLE_PROMPT in src/lib/providers/image/prompts.ts) -- this is
 * what actually fixes the "hijab on a European child" problem, without
 * inventing a "traditional dress" for every country on earth. See
 * docs/DECISIONS.md "Nationality drives culturally-appropriate
 * illustration, not separate templates".
 */
export function getFamilyDressDescription(nationality: Nationality, locale: 'en' | 'ar'): string {
  if (nationality === 'emirati') {
    return locale === 'ar' ? 'اللباس التقليدي الإماراتي' : 'traditional Emirati dress';
  }
  if (GULF_NATIONALITIES.has(nationality)) {
    return locale === 'ar' ? 'اللباس الخليجي التقليدي' : 'traditional Gulf dress';
  }
  return locale === 'ar' ? 'ملابس عصرية بسيطة ومحتشمة' : 'simple, modest, modern everyday clothing';
}
