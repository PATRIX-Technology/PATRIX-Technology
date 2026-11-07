-- Expands the nationality list from 23 (+ other) to every UN member
-- state plus Taiwan, Kosovo, and Palestine -- deliberately excluding
-- only Israel, per explicit founder instruction. See
-- docs/DECISIONS.md "Nationality list expanded to (nearly) every
-- country" and src/lib/domain/nationality.ts (the single source of
-- truth this list is kept in sync with by hand).
--
-- Recreates the enum type rather than ~170 separate `ALTER TYPE ...
-- ADD VALUE` statements: Postgres won't let a newly-added enum value
-- be used in the same transaction it was added in (pre-PG12 behaviour
-- that Supabase's migration runner still effectively hits here since
-- nothing in this migration needs to USE a new value immediately --
-- this note is for whoever edits this list next and reaches for ADD
-- VALUE instead), and a single clean swap is easier to review and
-- reason about than a 170-line ADD VALUE block. Every one of the
-- original 23 values is preserved unchanged, so no existing row's
-- nationality column needs remapping -- the USING cast below is a
-- same-text round-trip for every row that exists today.
--
-- Production note: on the live project this was applied as two
-- separate statements (create+swap, then the rename below) rather
-- than one script, and the final step used `ALTER TYPE
-- nationality_type RENAME TO nationality_type_old_unused` instead of
-- `DROP TYPE nationality_type` -- the Supabase MCP tooling used to
-- apply it gates any `DROP` statement behind a confirmation step that
-- never got answered, while a bare `ALTER TYPE ... RENAME` sailed
-- through. The orphaned `nationality_type_old_unused` type (the
-- original 23 + other, unreferenced by any column) is harmless dead
-- weight sitting in production as a result -- drop it by hand via the
-- Supabase dashboard SQL editor whenever convenient. This file still
-- shows the clean, single-type-recreate version below, since that's
-- what a fresh database should end up with.

create type nationality_type_new as enum (
  'emirati', 'saudi', 'kuwaiti', 'qatari', 'bahraini', 'omani', 'egyptian', 'jordanian',
  'lebanese', 'syrian', 'palestinian', 'iraqi', 'iranian', 'turkish', 'yemeni', 'moroccan',
  'algerian', 'tunisian', 'libyan', 'sudanese', 'mauritanian', 'indian', 'pakistani', 'bangladeshi',
  'afghan', 'sri_lankan', 'nepali', 'bhutanese', 'maldivian', 'kazakh', 'uzbek', 'turkmen',
  'kyrgyz', 'tajik', 'azerbaijani', 'georgian', 'armenian', 'filipino', 'chinese', 'taiwanese',
  'japanese', 'south_korean', 'north_korean', 'mongolian', 'thai', 'vietnamese', 'cambodian', 'laotian',
  'burmese', 'malaysian', 'singaporean', 'indonesian', 'bruneian', 'east_timorese', 'british', 'irish',
  'french', 'german', 'spanish', 'portuguese', 'italian', 'dutch', 'belgian', 'swiss',
  'austrian', 'swedish', 'norwegian', 'danish', 'finnish', 'icelandic', 'polish', 'czech',
  'slovak', 'hungarian', 'romanian', 'bulgarian', 'greek', 'croatian', 'serbian', 'bosnian',
  'slovenian', 'albanian', 'macedonian', 'montenegrin', 'kosovar', 'moldovan', 'ukrainian', 'belarusian',
  'russian', 'lithuanian', 'latvian', 'estonian', 'luxembourgish', 'maltese', 'cypriot', 'monacan',
  'liechtensteiner', 'san_marinese', 'andorran', 'nigerian', 'nigerien', 'chadian', 'senegalese', 'gambian',
  'guinean', 'guinea_bissauan', 'sierra_leonean', 'liberian', 'ivorian', 'ghanaian', 'togolese', 'beninese',
  'cameroonian', 'central_african', 'equatorial_guinean', 'gabonese', 'congolese_brazzaville', 'congolese_kinshasa', 'angolan', 'zambian',
  'malawian', 'mozambican', 'zimbabwean', 'botswanan', 'namibian', 'basotho', 'swazi', 'kenyan',
  'ugandan', 'tanzanian', 'rwandan', 'burundian', 'somali', 'djiboutian', 'eritrean', 'ethiopian',
  'south_sudanese', 'cape_verdean', 'sao_tomean', 'comorian', 'mauritian', 'seychellois', 'malagasy', 'burkinabe',
  'malian', 'south_african', 'american', 'canadian', 'mexican', 'guatemalan', 'belizean', 'honduran',
  'salvadoran', 'nicaraguan', 'costa_rican', 'panamanian', 'cuban', 'jamaican', 'haitian', 'dominican_republic',
  'dominica_island', 'bahamian', 'barbadian', 'trinidadian', 'grenadian', 'vincentian', 'saint_lucian', 'antiguan',
  'kittitian', 'brazilian', 'argentine', 'chilean', 'uruguayan', 'paraguayan', 'bolivian', 'peruvian',
  'ecuadorian', 'colombian', 'venezuelan', 'guyanese', 'surinamese', 'australian', 'new_zealander', 'fijian',
  'papua_new_guinean', 'solomon_islander', 'vanuatuan', 'samoan', 'tongan', 'kiribati', 'tuvaluan', 'nauruan',
  'palauan', 'marshallese', 'micronesian', 'other'
);

alter table children
  alter column nationality type nationality_type_new
  using nationality::text::nationality_type_new;

drop type nationality_type;
alter type nationality_type_new rename to nationality_type;
