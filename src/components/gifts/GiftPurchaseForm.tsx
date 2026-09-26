'use client';

import { useState } from 'react';
import { GIFT_PACKS } from '@/lib/domain/gifts';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Input';

export function GiftPurchaseForm({ locale }: { locale: string }) {
  const [packKey, setPackKey] = useState(GIFT_PACKS[1]!.key);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const response = await fetch('/api/gifts/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packKey, purchaserEmail: email, locale }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'Something went wrong.');
        return;
      }
      window.location.href = data.url;
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {GIFT_PACKS.map((pack) => (
          <label
            key={pack.key}
            className={`cursor-pointer rounded-xl2 border p-4 text-center ${
              packKey === pack.key ? 'border-lagoon-600 bg-lagoon-50' : 'border-[rgb(var(--color-border))]'
            }`}
          >
            <input
              type="radio"
              name="pack"
              value={pack.key}
              checked={packKey === pack.key}
              onChange={() => setPackKey(pack.key)}
              className="sr-only"
            />
            <p className="font-display text-lg text-ink-900">{pack.label}</p>
            <p className="mt-1 text-2xl font-semibold text-ink-800">${pack.priceUsd}</p>
          </label>
        ))}
      </div>
      <TextField
        name="email"
        type="email"
        label="Your email (for the receipt)"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {error && <p className="text-sm text-coral-600">{error}</p>}
      <Button type="submit" size="lg" isLoading={isLoading}>
        Continue to payment
      </Button>
      <p className="text-xs text-ink-500">Secure checkout powered by Stripe.</p>
    </form>
  );
}
