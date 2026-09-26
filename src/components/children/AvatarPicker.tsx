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
    <div className="flex flex-col gap-5">
      <AvatarPreview
        config={value}
        animated
        className="mx-auto h-36 w-36 shrink-0 drop-shadow-md sm:mx-0"
      />
      <div className="space-y-4">
        <PickerRow label={t('hair')}>
          {HAIR_OPTIONS.map((option) => (
            <OptionCard
              key={option}
              selected={value.hair === option}
              onClick={() => onChange({ ...value, hair: option })}
              label={option.replace('_', ' ')}
              preview={<AvatarPreview config={{ ...value, hair: option }} className="h-12 w-12" />}
            />
          ))}
        </PickerRow>
        <PickerRow label={t('skinTone')}>
          {SKIN_TONE_OPTIONS.map((option) => (
            <OptionCard
              key={option}
              selected={value.skinTone === option}
              onClick={() => onChange({ ...value, skinTone: option })}
              label={option}
              preview={<AvatarPreview config={{ ...value, skinTone: option }} className="h-12 w-12" />}
            />
          ))}
        </PickerRow>
        <PickerRow label={t('outfitColor')}>
          {OUTFIT_COLOR_OPTIONS.map((color) => (
            <OptionCard
              key={color}
              selected={value.outfitColor === color}
              onClick={() => onChange({ ...value, outfitColor: color })}
              preview={<AvatarPreview config={{ ...value, outfitColor: color }} className="h-12 w-12" />}
              ariaLabel={color}
            />
          ))}
        </PickerRow>
        <PickerRow label={t('accessory')}>
          {ACCESSORY_OPTIONS.map((option) => (
            <OptionCard
              key={option}
              selected={value.accessory === option}
              onClick={() => onChange({ ...value, accessory: option })}
              label={option === 'none' ? t('none') : option}
              preview={<AvatarPreview config={{ ...value, accessory: option }} className="h-12 w-12" />}
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
      <p className="mb-2 text-sm font-medium text-ink-700">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/**
 * A selectable card showing a live mini avatar preview for this option
 * (already merged with the child's other current choices), so the
 * picker reads as a small showroom of the actual character rather than
 * plain colour swatches or text labels — see docs/DECISIONS.md "Avatar
 * visual redesign".
 */
function OptionCard({
  selected,
  onClick,
  label,
  ariaLabel,
  preview,
}: {
  selected: boolean;
  onClick: () => void;
  label?: string;
  ariaLabel?: string;
  preview: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={ariaLabel ?? label}
      onClick={onClick}
      className={`focus-ring flex flex-col items-center gap-1 rounded-xl border-2 p-1.5 transition-colors ${
        selected
          ? 'border-lagoon-600 bg-lagoon-50'
          : 'border-transparent hover:border-[rgb(var(--color-border))]'
      }`}
    >
      <span className="relative">
        {preview}
        {selected && (
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-lagoon-600 text-white shadow-sm">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
              <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4L8 11.6l6.8-6.8a1 1 0 0 1 1.4 0Z" />
            </svg>
          </span>
        )}
      </span>
      {label && <span className="text-[11px] capitalize text-ink-600">{label}</span>}
    </button>
  );
}
