'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFormState } from 'react-dom';
import { importChildrenCsvAction, type ImportCsvResult } from '@/lib/actions/children';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

export function CsvImportDialog({ locale }: { locale: string }) {
  const t = useTranslations('children');
  const [open, setOpen] = useState(false);
  const action = importChildrenCsvAction.bind(null, locale);
  const [state, formAction] = useFormState<ImportCsvResult, FormData>(async (_prev, formData) => {
    return action(formData);
  }, {});

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {t('importCsv')}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('importCsv')}>
        <form action={formAction} className="flex flex-col gap-4">
          <p className="text-sm text-ink-600">
            Columns required: <code>first_name, pronoun, class_name, preferred_language</code>. Pronoun
            accepts she/he/they and preferred_language accepts en/ar.
          </p>
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            className="focus-ring rounded-lg border border-[rgb(var(--color-border))] p-2 text-sm"
          />
          {state.error && (
            <p role="alert" className="text-sm text-coral-600">
              {state.error}
            </p>
          )}
          {typeof state.imported === 'number' && (
            <p className="text-sm text-lagoon-700">Imported {state.imported} children.</p>
          )}
          {state.rowErrors && state.rowErrors.length > 0 && (
            <ul className="max-h-40 overflow-y-auto rounded-lg bg-coral-50 p-3 text-xs text-coral-700">
              {state.rowErrors.map((rowError) => (
                <li key={rowError.row}>
                  Row {rowError.row}: {rowError.errors.join(', ')}
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button type="submit">{t('importCsv')}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
