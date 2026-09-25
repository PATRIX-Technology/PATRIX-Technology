'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { addChildAction } from '@/lib/actions/children';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ChildForm } from './ChildForm';

export function AddChildDialog({ locale }: { locale: string }) {
  const t = useTranslations('children');
  const tForm = useTranslations('children.form');
  const [open, setOpen] = useState(false);
  const action = addChildAction.bind(null, locale);

  return (
    <>
      <Button onClick={() => setOpen(true)}>{t('add')}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('add')}>
        <ChildForm
          action={action}
          submitLabel={tForm('save')}
          onCancel={() => setOpen(false)}
          onSuccess={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}
