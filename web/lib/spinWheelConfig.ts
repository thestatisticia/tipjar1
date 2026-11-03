export const SPIN_OUTCOMES = [
  { id: 'zero', label: '0 G$', prizeG: 0, color: '#2563eb' },
  { id: 'good_luck', label: 'Good luck', prizeG: 0, color: '#06b6d4' },
  { id: '10_g', label: '10 G$', prizeG: 10, color: '#16a34a' },
  { id: '20_g', label: '20 G$', prizeG: 20, color: '#a855f7' },
  { id: '50_g', label: '50 G$', prizeG: 50, color: '#f59e0b' },
  { id: '100_g', label: '100 G$', prizeG: 100, color: '#ec4899' },
  { id: '200_g', label: '200 G$', prizeG: 200, color: '#fcff52' },
] as const;

export type SpinOutcomeId = (typeof SPIN_OUTCOMES)[number]['id'];
export type SpinOutcome = (typeof SPIN_OUTCOMES)[number];

export function getSpinOutcome(id: string): SpinOutcome | undefined {
  return SPIN_OUTCOMES.find((outcome) => outcome.id === id);
}
