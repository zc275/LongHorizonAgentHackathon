// Synthetic household data only. Stable IDs allow repeat loads to skip existing rows.
export const demoDataset = "nightwatch_household_v1";
const examples = [
  { kind: "HOUSEHOLD_CREATED", summary: "The Rivera household is ready", payload: { name: "Rivera family", synthetic: true } },
  { kind: "CONTACT_ADDED", summary: "Martin is the first contact", payload: { name: "Martin Rivera", phone: "+12025550101", priority: 1, notify_when: "A room check needs an adult" } },
  { kind: "CONTACT_ADDED", summary: "Anna is the backup contact", payload: { name: "Anna Rivera", phone: "+12025550102", priority: 2, notify_when: "No acknowledgment after 2 minutes" } },
  { kind: "INVENTORY_UPDATED", summary: "6 size M diapers remaining", payload: { item: "diapers", size: "M", quantity: 6, revision: 1, confirmed_by: "Martin Rivera" } },
  { kind: "RULE_CREATED", summary: "Prepare a reorder when stock falls below 6", payload: { rule: "diaper_reorder", minimum: 6, budget_usd: 25, purchase_mode: "review_only" } },
  { kind: "DEVICE_REGISTERED", summary: "Nursery device added for documentation lookup", payload: { device: "Example humidifier", model: "REPLACE_WITH_EXACT_MODEL", evidence_status: "not_researched" } },
  { kind: "CARE_EVENT_CONFIRMED", summary: "Martin confirmed a diaper change", payload: { confirmed_by: "Martin Rivera", source: "caregiver", camera_inferred: false } },
  { kind: "INVENTORY_UPDATED", summary: "5 size M diapers remaining", payload: { item: "diapers", size: "M", quantity: 5, revision: 2, confirmed_by: "Martin Rivera" } },
  { kind: "RESEARCH_REQUESTED", summary: "Look up size M diaper options", payload: { provider: "Nimble", public_query: "size M diapers manufacturer product information", status: "pending", results: [] } },
  { kind: "ORDER_DRAFTED", summary: "Diaper order awaiting review", payload: { size: "M", max_budget_usd: 25, status: "awaiting_review", actual_purchase: false } },
  { kind: "CONTACT_PRIORITY_CHANGED", summary: "Anna takes over the next check", payload: { primary_contact: "Anna Rivera", previous_contact: "Martin Rivera", revision: 2 } },
  { kind: "HANDOVER_RECORDED", summary: "Stock, responsibility and pending order remembered", payload: { next_contact: "Anna Rivera", diapers_remaining: 5, pending: ["research", "order_review"], restart_proof: "Query these records again after restarting the local app" } }
];
export const demoSeed = examples.map((item, index) => ({
  dataset_id: demoDataset,
  event_id: `${demoDataset}_${String(index + 1).padStart(3, "0")}`,
  family_id: "synthetic_rivera",
  environment: "TEST",
  sequence: index + 1,
  occurred_at: new Date(Date.UTC(2026, 8, 25, 14, index)).toISOString(),
  ...item
}));
