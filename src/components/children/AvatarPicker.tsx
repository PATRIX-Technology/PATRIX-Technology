'use client';

import { useTranslations } from 'next-intl';
import {
  ACCESSORY_OPTIONS,
  HAIR_OPTIONS,
  OUTFIT_COLOR_OPTIONS,
  SKIN_TONE_OPTIONS,
  type AvatarConfig,
} from '@/lib/domain/avatar';
import { AvatarPreview } from './AvatarPreview';

export function AvatarPicker({
  value,
  onChange,
}: {
  value: AvatarConfig;
  onChange: (next: AvatarConfig) => void;
}) {
  const t = useTranslations('avatar');

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
      <AvatarPreview config={value} className="h-32 w-32 shrink-0 self-center sm:self-start" />
      <div className="flex-1 space-y-3">
        <PickerRow label={t('hair')}>
          {HAIR_OPTIONS.map((option) => (
            <SwatchButton
              key={option}
              selected={value.hair === option}
              onClick={() => onChange({ ...value, hair: option })}
              label={option.replace('_', ' ')}
            />
          ))}
        </PickerRow>
        <PickerRow label={t('skinTone')}>
          {SKIN_TONE_OPTIONS.map((option) => (
            <SwatchButton
              key={option}
              selected={value.skinTone === option}
              onClick={() => onChange({ ...value, skinTone: option })}
              label={option}
            />
          ))}
        </PickerRow>
        <PickerRow label={t('outfitColor')}>
          {OUTFIT_COLOR_OPTIONS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={color}
              aria-pressed={value.outfitColor === color}
              onClick={() => onChange({ ...value, outfitColor: color })}
              className={`focus-ring h-8 w-8 rounded-full border-2 ${
                value.outfitColor === color ? 'border-ink-800' : 'border-transparent'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </PickerRow>
        <PickerRow label={t('accessory')}>
          {ACCESSORY_OPTIONS.map((option) => (
            <SwatchButton
              key={option}
              selected={value.accessory === option}
              onClick={() => onChange({ ...value, accessory: option })}
              label={option === 'none' ? t('none') : option}
            />
          ))}
        </PickerRow>
        <input type="hidden" name="avatarConfig" value={JSON.stringify(value)} />
      </div>
    </div>
  );
}

function PickerRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-ink-700">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function SwatchButton({
  selected,
  onClick,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`focus-ring rounded-full border px-3 py-1 text-xs font-medium capitalize ${
        selected
          ? 'border-lagoon-600 bg-lagoon-100 text-lagoon-800'
          : 'border-[rgb(var(--color-border))] text-ink-600 hover:bg-ink-100'
      }`}
    >
      {label}
    </button>
  );
}
