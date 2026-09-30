// Sample experiments the tool can create from nothing, for accounts that have no flags or metrics yet.
// Shared between the UI (to list them) and the quickstart route (to build the API calls).

export type QuickstartTemplate = {
  id: string;
  title: string;
  blurb: string;
  flag: { name: string; description: string; variations: Array<{ name: string; value: string }> };
  metric: {
    name: string;
    description: string;
    isNumeric: boolean;
    unit?: string;
    unitAggregationType?: 'average' | 'sum';
    successCriteria: 'HigherThanBaseline' | 'LowerThanBaseline';
  };
  experiment: { name: string; hypothesis: string };
};

export const QUICKSTART_TEMPLATES: QuickstartTemplate[] = [
  {
    id: 'cta-copy',
    title: 'Call-to-action copy test',
    blurb: 'Two button labels, measured by purchases. The classic first experiment.',
    flag: {
      name: 'Sample: checkout button copy',
      description: 'Created by the Experiment Simulator. Safe to archive.',
      variations: [
        { name: 'Buy now', value: 'Buy now' },
        { name: 'Add to cart', value: 'Add to cart' },
      ],
    },
    metric: {
      name: 'Sample: purchase completed',
      description: 'Created by the Experiment Simulator. One conversion per visitor.',
      isNumeric: false,
      successCriteria: 'HigherThanBaseline',
    },
    experiment: {
      name: 'Sample: checkout button copy',
      hypothesis: 'Changing the checkout button label from "Buy now" to "Add to cart" increases purchases.',
    },
  },
  {
    id: 'pricing-layout',
    title: 'Pricing page layout (3 variations)',
    blurb: 'Control plus two challengers, measured by checkouts started.',
    flag: {
      name: 'Sample: pricing page layout',
      description: 'Created by the Experiment Simulator. Safe to archive.',
      variations: [
        { name: 'Current layout', value: 'current' },
        { name: 'Cards', value: 'cards' },
        { name: 'Comparison table', value: 'table' },
      ],
    },
    metric: {
      name: 'Sample: checkout started',
      description: 'Created by the Experiment Simulator. One conversion per visitor.',
      isNumeric: false,
      successCriteria: 'HigherThanBaseline',
    },
    experiment: {
      name: 'Sample: pricing page layout',
      hypothesis: 'A card or comparison-table layout gets more visitors to start checkout than the current layout.',
    },
  },
  {
    id: 'checkout-speed',
    title: 'Checkout speed (numeric, lower is better)',
    blurb: 'A numeric metric: seconds to complete checkout. Shows how averages are compared.',
    flag: {
      name: 'Sample: one-page checkout',
      description: 'Created by the Experiment Simulator. Safe to archive.',
      variations: [
        { name: 'Multi-step checkout', value: 'multi-step' },
        { name: 'One-page checkout', value: 'one-page' },
      ],
    },
    metric: {
      name: 'Sample: checkout time',
      description: 'Created by the Experiment Simulator. Seconds from cart to confirmation.',
      isNumeric: true,
      unit: 'seconds',
      unitAggregationType: 'average',
      successCriteria: 'LowerThanBaseline',
    },
    experiment: {
      name: 'Sample: one-page checkout',
      hypothesis: 'A one-page checkout is faster to complete than the multi-step checkout.',
    },
  },
];
