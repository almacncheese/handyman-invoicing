/**
 * Industry starter packs — ready-made price-list items a new workspace can
 * import in one click so onboarding feels tailored to their trade/business.
 * Values are in whole dollars (the /api/templates/presets route converts to cents).
 */

export type PresetItem =
  | { type: 'material'; description: string; cost: number; marginPercent: number }
  | { type: 'labor'; description: string; hours: number; rate: number }
  | { type: 'flat'; description: string; amount: number };

export type IndustryPreset = {
  key: string;
  label: string;
  blurb: string;
  items: PresetItem[];
};

export const INDUSTRY_PRESETS: IndustryPreset[] = [
  {
    key: 'general',
    label: 'General contractor / Handyman',
    blurb: 'Common repair materials, labor, and trip fees.',
    items: [
      { type: 'labor', description: 'General labor', hours: 1, rate: 65 },
      { type: 'labor', description: 'Skilled trade labor', hours: 1, rate: 95 },
      { type: 'material', description: 'Pressure-treated 2x6 (8ft)', cost: 12, marginPercent: 30 },
      { type: 'material', description: 'Drywall sheet 4x8', cost: 16, marginPercent: 30 },
      { type: 'flat', description: 'Trip / service call fee', amount: 75 },
      { type: 'flat', description: 'Debris haul-away', amount: 120 },
    ],
  },
  {
    key: 'plumbing',
    label: 'Plumbing',
    blurb: 'Fixtures, fittings, and standard plumbing labor.',
    items: [
      { type: 'labor', description: 'Plumber labor', hours: 1, rate: 110 },
      { type: 'material', description: 'Kitchen faucet (mid-grade)', cost: 120, marginPercent: 35 },
      { type: 'material', description: 'Angle stop / shutoff valve', cost: 9, marginPercent: 40 },
      { type: 'material', description: 'Wax ring + bolts', cost: 6, marginPercent: 50 },
      { type: 'flat', description: 'Drain clearing', amount: 175 },
      { type: 'flat', description: 'Emergency call-out', amount: 150 },
    ],
  },
  {
    key: 'electrical',
    label: 'Electrical',
    blurb: 'Devices, wire, and licensed electrician labor.',
    items: [
      { type: 'labor', description: 'Electrician labor', hours: 1, rate: 115 },
      { type: 'material', description: 'Duplex outlet (spec grade)', cost: 3, marginPercent: 60 },
      { type: 'material', description: 'Decora dimmer switch', cost: 22, marginPercent: 40 },
      { type: 'material', description: '14/2 Romex (per ft)', cost: 1, marginPercent: 50 },
      { type: 'flat', description: 'Panel inspection', amount: 125 },
      { type: 'flat', description: 'Permit handling', amount: 90 },
    ],
  },
  {
    key: 'hvac',
    label: 'HVAC',
    blurb: 'Maintenance, parts, and system labor.',
    items: [
      { type: 'labor', description: 'HVAC technician labor', hours: 1, rate: 120 },
      { type: 'material', description: 'Air filter (MERV 11)', cost: 14, marginPercent: 45 },
      { type: 'material', description: 'Capacitor (dual run)', cost: 25, marginPercent: 50 },
      { type: 'flat', description: 'Seasonal tune-up', amount: 129 },
      { type: 'flat', description: 'Refrigerant recharge', amount: 250 },
      { type: 'flat', description: 'Diagnostic fee', amount: 89 },
    ],
  },
  {
    key: 'painting',
    label: 'Painting',
    blurb: 'Paint, supplies, and prep/paint labor.',
    items: [
      { type: 'labor', description: 'Painter labor', hours: 1, rate: 55 },
      { type: 'labor', description: 'Surface prep & masking', hours: 1, rate: 45 },
      { type: 'material', description: 'Premium interior paint (gallon)', cost: 42, marginPercent: 35 },
      { type: 'material', description: 'Primer (gallon)', cost: 28, marginPercent: 35 },
      { type: 'flat', description: 'Room repaint (up to 12x12)', amount: 350 },
    ],
  },
  {
    key: 'landscaping',
    label: 'Landscaping / Lawn care',
    blurb: 'Recurring service and materials.',
    items: [
      { type: 'labor', description: 'Crew labor', hours: 1, rate: 50 },
      { type: 'material', description: 'Hardwood mulch (cu yd)', cost: 32, marginPercent: 40 },
      { type: 'material', description: 'Sod (per sq ft)', cost: 1, marginPercent: 50 },
      { type: 'flat', description: 'Weekly mowing (avg lot)', amount: 45 },
      { type: 'flat', description: 'Spring cleanup', amount: 225 },
    ],
  },
  {
    key: 'cleaning',
    label: 'Cleaning services',
    blurb: 'Residential & commercial cleaning packages.',
    items: [
      { type: 'labor', description: 'Cleaner labor', hours: 1, rate: 40 },
      { type: 'flat', description: 'Standard home clean', amount: 130 },
      { type: 'flat', description: 'Deep clean', amount: 260 },
      { type: 'flat', description: 'Move-out clean', amount: 320 },
      { type: 'material', description: 'Supplies & consumables', cost: 15, marginPercent: 30 },
    ],
  },
  {
    key: 'auto',
    label: 'Auto repair / Detailing',
    blurb: 'Shop labor, parts, and detail packages.',
    items: [
      { type: 'labor', description: 'Shop labor', hours: 1, rate: 130 },
      { type: 'material', description: 'Synthetic oil (per qt)', cost: 7, marginPercent: 45 },
      { type: 'material', description: 'Oil filter', cost: 8, marginPercent: 50 },
      { type: 'flat', description: 'Full-service oil change', amount: 89 },
      { type: 'flat', description: 'Interior + exterior detail', amount: 199 },
    ],
  },
  {
    key: 'freelance',
    label: 'Freelance & creative (dev/design)',
    blurb: 'Hourly rates and packaged deliverables.',
    items: [
      { type: 'labor', description: 'Design hours', hours: 1, rate: 95 },
      { type: 'labor', description: 'Development hours', hours: 1, rate: 125 },
      { type: 'flat', description: 'Logo & brand kit', amount: 1200 },
      { type: 'flat', description: 'Landing page build', amount: 2500 },
      { type: 'flat', description: 'Monthly retainer', amount: 3000 },
    ],
  },
  {
    key: 'photography',
    label: 'Photography / Video',
    blurb: 'Session fees, deliverables, and add-ons.',
    items: [
      { type: 'labor', description: 'Shoot hours', hours: 1, rate: 150 },
      { type: 'flat', description: 'Portrait session', amount: 350 },
      { type: 'flat', description: 'Event coverage (half day)', amount: 900 },
      { type: 'flat', description: 'Edited gallery delivery', amount: 250 },
      { type: 'flat', description: 'Rush turnaround', amount: 150 },
    ],
  },
  {
    key: 'events',
    label: 'Events & catering',
    blurb: 'Per-guest pricing, staff, and rentals.',
    items: [
      { type: 'labor', description: 'Event staff (per hr)', hours: 1, rate: 35 },
      { type: 'flat', description: 'Catering (per guest)', amount: 45 },
      { type: 'flat', description: 'Bar service (per guest)', amount: 22 },
      { type: 'material', description: 'Table & linen rental (per table)', cost: 18, marginPercent: 40 },
      { type: 'flat', description: 'Setup & breakdown', amount: 300 },
    ],
  },
  {
    key: 'consulting',
    label: 'Consulting & professional services',
    blurb: 'Advisory hours and fixed-scope packages.',
    items: [
      { type: 'labor', description: 'Consulting hours', hours: 1, rate: 175 },
      { type: 'labor', description: 'Strategy workshop (per hr)', hours: 1, rate: 250 },
      { type: 'flat', description: 'Discovery & audit', amount: 1500 },
      { type: 'flat', description: 'Monthly advisory retainer', amount: 2500 },
    ],
  },
];

export const INDUSTRY_OPTIONS = INDUSTRY_PRESETS.map((p) => ({
  key: p.key,
  label: p.label,
  blurb: p.blurb,
  count: p.items.length,
}));
