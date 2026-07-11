import { describe, expect, it } from 'vitest';
import {
  arAging,
  conversionRates,
  monthlySeries,
  paymentsByMethod,
  sumByJobType,
  sumByStatus,
} from './reporting';

const now = new Date('2026-07-11T12:00:00Z');

describe('reporting', () => {
  it('sums by status and job type', () => {
    const quotes = [
      {
        status: 'draft',
        jobType: 'deck',
        totalCents: 10000,
        createdAt: now,
        acceptedAt: null,
        sentAt: null,
      },
      {
        status: 'accepted',
        jobType: 'deck',
        totalCents: 20000,
        createdAt: now,
        acceptedAt: now,
        sentAt: now,
      },
      {
        status: 'sent',
        jobType: 'plumbing',
        totalCents: 5000,
        createdAt: now,
        acceptedAt: null,
        sentAt: now,
      },
    ];
    expect(sumByStatus(quotes).accepted.totalCents).toBe(20000);
    const byJob = sumByJobType(quotes);
    expect(byJob[0].jobType).toBe('deck');
    expect(byJob[0].totalCents).toBe(30000);
  });

  it('conversion rates', () => {
    const quotes = [
      { status: 'sent', jobType: null, totalCents: 1, createdAt: now, acceptedAt: null, sentAt: now },
      {
        status: 'accepted',
        jobType: null,
        totalCents: 1,
        createdAt: now,
        acceptedAt: now,
        sentAt: now,
      },
      {
        status: 'declined',
        jobType: null,
        totalCents: 1,
        createdAt: now,
        acceptedAt: null,
        sentAt: now,
      },
    ];
    const c = conversionRates(quotes);
    expect(c.sent).toBe(3);
    expect(c.accepted).toBe(1);
    expect(c.sentToAcceptedPct).toBeCloseTo(33.3, 0);
  });

  it('AR aging buckets', () => {
    const inv = [
      {
        status: 'open',
        totalCents: 1000,
        amountDueCents: 1000,
        amountPaidCents: 0,
        depositCents: 0,
        createdAt: new Date('2026-07-10T00:00:00Z'),
        dueAt: new Date('2026-07-12T00:00:00Z'),
      },
      {
        status: 'partial',
        totalCents: 5000,
        amountDueCents: 2000,
        amountPaidCents: 3000,
        depositCents: 0,
        createdAt: new Date('2026-05-01T00:00:00Z'),
        dueAt: new Date('2026-05-01T00:00:00Z'),
      },
    ];
    const a = arAging(inv, now);
    expect(a.currentCents).toBe(1000);
    // May 1 → Jul 11 ≈ 71 days → 61–90 bucket
    expect(a.d61_90Cents).toBe(2000);
    expect(a.totalDueCents).toBe(3000);
  });

  it('payments by method and monthly series', () => {
    const payments = [
      {
        amountCents: 1000,
        method: 'cash',
        status: 'succeeded',
        createdAt: new Date('2026-07-01T00:00:00Z'),
      },
      {
        amountCents: 500,
        method: 'zelle',
        status: 'succeeded',
        createdAt: new Date('2026-06-15T00:00:00Z'),
      },
    ];
    const by = paymentsByMethod(payments);
    expect(by.find((m) => m.method === 'cash')?.totalCents).toBe(1000);
    const series = monthlySeries(payments, [], 3, now);
    expect(series).toHaveLength(3);
    expect(series[series.length - 1].key).toBe('2026-07');
  });
});
