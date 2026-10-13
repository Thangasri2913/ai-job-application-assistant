/** "25%", or an em dash when there is no denominator (never a made-up 0%). */
export const formatRate = (rate: number | null) =>
  rate === null ? '—' : `${Math.round(rate * 100)}%`;
