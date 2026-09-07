/**
 * Number formatting with a fixed locale. The UI is English and these values
 * render on the server too, so the output must not depend on the browser's
 * locale (a `toLocaleString()` mismatch breaks hydration).
 */
const intFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export const formatInt = (value: number): string => intFormatter.format(value);

/** Cost in USD with four decimals, e.g. "$0.0123". */
export const formatCost = (value: number): string => `$${value.toFixed(4)}`;
