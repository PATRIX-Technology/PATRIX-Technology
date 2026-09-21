import Link from 'next/link';
import { FamilySignUpForm } from '@/components/auth/FamilySignUpForm';
import { Card } from '@/components/ui/Card';

export default function FamilySignUpPage({ params }: { params: { locale: string } }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[rgb(var(--color-surface))] px-4 py-12">
      <Card className="w-full max-w-md">
        <h1 className="mb-2 font-display text-2xl text-ink-900">Create your family account</h1>
        <p className="mb-6 text-sm text-ink-600">
          For parents and guardians creating stories for their own children. Are you a nursery, school,
          or organisation?{' '}
          <Link href={`/${params.locale}/sign-up`} className="font-medium text-lagoon-600">
            Sign up here instead
          </Link>
          .
        </p>
        <FamilySignUpForm locale={params.locale} />
        <p className="mt-6 text-center text-sm text-ink-500">
          Already have an account?{' '}
          <Link href={`/${params.locale}/sign-in`} className="font-medium text-lagoon-600">
            Sign in
          </Link>
        </p>
      </Card>
    </main>
  );
}
