import { POV, Tone } from './types';

export const POV_OPTIONS: { value: POV; label: string }[] = [
  { value: 'Pro', label: 'Pro' },
  { value: 'Critical', label: 'Critical' },
  { value: 'Neutral', label: 'Neutral' },
  { value: 'Satirical', label: 'Satirical' },
];

export const TONE_OPTIONS: { value: Tone; label: string }[] = [
  { value: 'satirical', label: 'Satirical' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'ironic', label: 'Ironic' },
  { value: 'deadpan', label: 'Deadpan' },
];
