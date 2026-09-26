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
          <div className="rounded-lg bg-ink-50 p-3 text-sm text-ink-600">
            <p className="mb-2 font-medium text-ink-800">CSV columns</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-ink-500">
                  <th className="pb-1 pr-2 font-medium">Column</th>
                  <th className="pb-1 pr-2 font-medium">Required</th>
                  <th className="pb-1 font-medium">Accepted values</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="pr-2 py-0.5">
                    <code>first_name</code>
                  </td>
                  <td className="pr-2 py-0.5">Yes</td>
                  <td className="py-0.5">Any text, no digits</td>
                </tr>
                <tr>
                  <td className="pr-2 py-0.5">
                    <code>last_name</code>
                  </td>
                  <td className="pr-2 py-0.5">No</td>
                  <td className="py-0.5">Any text, no digits</td>
                </tr>
                <tr>
                  <td className="pr-2 py-0.5">
                    <code>arabic_first_name</code>
                  </td>
                  <td className="pr-2 py-0.5">No</td>
                  <td className="py-0.5">Arabic spelling, used for Arabic stories</td>
                </tr>
                <tr>
                  <td className="pr-2 py-0.5">
                    <code>arabic_last_name</code>
                  </td>
                  <td className="pr-2 py-0.5">No</td>
                  <td className="py-0.5">Arabic spelling</td>
                </tr>
                <tr>
                  <td className="pr-2 py-0.5">
                    <code>pronoun</code>
                  </td>
                  <td className="pr-2 py-0.5">Yes</td>
                  <td className="py-0.5">she / he / they</td>
                </tr>
                <tr>
                  <td className="pr-2 py-0.5">
                    <code>class_name</code>
                  </td>
                  <td className="pr-2 py-0.5">Yes</td>
                  <td className="py-0.5">Any text, e.g. KG1-A</td>
                </tr>
                <tr>
                  <td className="pr-2 py-0.5">
                    <code>preferred_language</code>
                  </td>
                  <td className="pr-2 py-0.5">Yes</td>
                  <td className="py-0.5">en / ar</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2">
              The <code>first_name</code>, <code>pronoun</code>, <code>class_name</code> and{' '}
              <code>preferred_language</code> columns must all be present in the header row, but
              individual cells can be left blank — a blank <code>pronoun</code> defaults to
              &quot;they&quot; and a blank <code>preferred_language</code> defaults to
              &quot;en&quot;.
            </p>
            <p className="mt-2">
              Avatar and photo consent aren&apos;t set by the import — every child gets a default
              avatar and starts with consent not requested; both are set per-child afterwards.
            </p>
            <a
              href="/templates/children-import-template.csv"
              download
              className="focus-ring mt-2 inline-block font-medium text-lagoon-700 underline"
            >
              Download a template CSV
            </a>
          </div>
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
