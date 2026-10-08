/**
 * Copy and illustrative data for the public landing page.
 * Everything in the product mock-ups (business name, price, phone numbers,
 * call log rows) is sample content, not real customer data.
 */

export const SAMPLE_BUSINESS = "Shree Packaging Co.";

export const TICKER_ITEMS = [
  { who: "Dental clinic", what: "Appointment booked for 11:30" },
  { who: "Real estate", what: "Site visit set for Saturday" },
  { who: "Wholesaler", what: "Quotation sent on WhatsApp" },
  { who: "Coaching institute", what: "Demo class booked" },
  { who: "Home services", what: "Transferred to on-call technician" },
  { who: "Car showroom", what: "Test drive confirmed" },
  { who: "Restaurant", what: "Table for six reserved" },
] as const;

export const SETUP_STEPS = [
  {
    title: "Create your agent",
    desc: "Choose a voice and language, write the greeting, and set what it should and shouldn't handle.",
  },
  {
    title: "Add your business knowledge",
    desc: "Upload FAQs, price lists and policies. Update them whenever your business changes.",
  },
  {
    title: "Connect your number",
    desc: "Provision a local or toll-free number and route your calls to the agent.",
  },
  {
    title: "Go live and review",
    desc: "Watch calls come in with transcripts and outcomes, and fine-tune as you learn.",
  },
] as const;

export const KNOWLEDGE_FILES = [
  "Price list 2026.pdf",
  "Customer FAQs.docx",
  "Delivery and returns policy.pdf",
] as const;

export type Outcome = "resolved" | "transferred" | "whatsapp";

export const CALL_LOG: ReadonlyArray<{
  time: string;
  caller: string;
  summary: string;
  outcome: Outcome;
  length: string;
}> = [
  {
    time: "10:42",
    caller: "+91 98••• ••210",
    summary: "Quote for 500 printed boxes",
    outcome: "whatsapp",
    length: "01:12",
  },
  {
    time: "10:31",
    caller: "+91 99••• ••087",
    summary: "Delivery date for an existing order",
    outcome: "resolved",
    length: "00:48",
  },
  {
    time: "10:18",
    caller: "+91 97••• ••552",
    summary: "Bulk pricing enquiry",
    outcome: "transferred",
    length: "02:05",
  },
  {
    time: "09:57",
    caller: "+91 98••• ••314",
    summary: "Store timings and location",
    outcome: "resolved",
    length: "00:31",
  },
];

export const OUTCOME_LABEL: Record<Outcome, string> = {
  resolved: "Resolved",
  transferred: "Transferred",
  whatsapp: "WhatsApp",
};

/** Bar heights (px) for the decorative waveforms. */
export const WAVE = {
  console: [
    10, 16, 24, 30, 20, 28, 14, 22, 30, 26, 18, 12, 24, 30, 16, 22, 28, 12, 20, 26, 30, 18, 10, 16, 24, 14,
    22, 28, 18, 12, 20, 26, 14, 10, 16, 8,
  ],
  voice: [
    14, 28, 46, 64, 40, 72, 52, 30, 58, 80, 62, 36, 70, 54, 26, 48, 76, 44, 22, 38, 60, 34, 18, 28, 14, 10,
  ],
  mini: [
    6, 10, 16, 22, 14, 24, 18, 10, 20, 26, 16, 8, 18, 24, 12, 16, 22, 10, 14, 20, 24, 14, 8, 12, 18, 10, 16,
    20, 12, 8,
  ],
  tiny: [6, 12, 18, 10, 16, 20, 8, 14, 18, 10, 6, 12],
} as const;

/** Relative call volume by hour (0–23), as a percentage of the chart height. Illustrative. */
export const HOURLY_VOLUME = [
  12, 9, 7, 7, 9, 14, 24, 40, 58, 74, 86, 92, 84, 74, 78, 86, 92, 96, 90, 72, 54, 38, 24, 16,
] as const;
