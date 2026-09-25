import Nimble from "@nimble-way/nimble-js";
import type { ParentNotification, ResearchSource } from "../shared/api.js";
import type { Situation } from "../shared/domain.js";

export interface AlertContext {
  sessionId: string;
  situation: Situation;
  videoTimestamp: number;
}

export interface AlertEnricher {
  readonly mode: ParentNotification["research_provider"];
  enrich(context: AlertContext): Promise<Pick<ParentNotification, "message" | "research_summary" | "sources">>;
}

const fallbackSources: ResearchSource[] = [
  {
    title: "Safe Sleep",
    url: "https://www.healthychildren.org/English/ages-stages/baby/sleep/Pages/a-parents-guide-to-safe-sleep.aspx",
    snippet: "General safe-sleep guidance for parents from the American Academy of Pediatrics."
  },
  {
    title: "Cribs and Infant Products",
    url: "https://www.cpsc.gov/SafeSleep",
    snippet: "Federal safe-sleep and nursery-product guidance from the U.S. Consumer Product Safety Commission."
  }
];

function parentMessage(context: AlertContext): string {
  const seconds = Math.round(context.videoTimestamp);
  return `Nightwatch observed a child outside a crib for the configured alert period at ${seconds}s. Please check the nursery now. The links below are general safety guidance, not a diagnosis.`;
}

export class DemoSafetyResearchProvider implements AlertEnricher {
  readonly mode = "demo_fallback" as const;

  async enrich(context: AlertContext) {
    return {
      message: parentMessage(context),
      research_summary: "Live Nimble search is not configured, so Nightwatch attached a small, preselected set of authoritative safety resources.",
      sources: fallbackSources
    };
  }
}

export class NimbleSafetyResearchProvider implements AlertEnricher {
  readonly mode = "nimble_live" as const;
  private readonly client: Nimble;

  constructor(apiKey: string) {
    this.client = new Nimble({ apiKey });
  }

  async enrich(context: AlertContext) {
    const result = await this.client.search({
      query: "authoritative toddler climbed out of crib parent safety guidance what to do",
      include_domains: ["healthychildren.org", "cpsc.gov"],
      search_depth: "lite",
      max_results: 3,
      include_answer: true,
      country: "US",
      locale: "en"
    });
    const sources = result.results.slice(0, 3).map((item): ResearchSource => ({
      title: item.title,
      url: item.url,
      snippet: item.description.slice(0, 240)
    }));
    if (sources.length === 0) throw new Error("Nimble returned no vetted safety sources");
    return {
      message: parentMessage(context),
      research_summary: result.answer?.slice(0, 600) ?? "Nimble found current guidance from the vetted sources below.",
      sources
    };
  }
}

export function createAlertEnricher(): AlertEnricher {
  const apiKey = process.env.NIMBLE_API_KEY?.trim();
  return apiKey ? new NimbleSafetyResearchProvider(apiKey) : new DemoSafetyResearchProvider();
}
