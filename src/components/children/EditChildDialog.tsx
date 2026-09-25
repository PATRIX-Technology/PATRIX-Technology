'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { updateChildAction } from '@/lib/actions/children';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ChildForm, type ChildFormDefaults } from './ChildForm';

export function EditChildDialog({
  locale,
  childId,
  defaultValues,
}: {
  locale: string;
  childId: string;
  defaultValues: ChildFormDefaults;
}) {
  const t = useTranslations('children');
  const tForm = useTranslations('children.form');
  const [open, setOpen] = useState(false);
  const action = updateChildAction.bind(null, locale, childId);

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {t('edit')}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('edit')}>
        <ChildForm
          action={action}
          defaultValues={defaultValues}
          submitLabel={tForm('save')}
          onCancel={() => setOpen(false)}
          onSuccess={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}
