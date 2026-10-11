export type VariantKey = "A" | "B" | "C";
export const VARIANT_KEYS: VariantKey[] = ["A", "B", "C"];

export type Segment = { label: string; value: number };

export type VariantImage = {
  id: string;
  path: string;
  width: number;
  height: number;
  label: string;
  sort: number;
};

export type Variant = {
  id: string;
  key: VariantKey;
  name: string;
  description: string;
  images: VariantImage[];
};

export type TestStatus = "borrador" | "publicado";
/** quiz: ganadora conocida · poll: capturas sin ganadora oficial (se ve el voto de la comunidad) · library: solo consulta. */
export type PlayMode = "quiz" | "poll" | "library";
export type Outcome = "win" | "loss" | "mixed" | "flat" | "unknown";

export type Test = {
  id: string;
  slug: string;
  title: string;
  company: string | null;
  industry: string | null;
  country: string | null;
  category: string;
  device: "Todos" | "Desktop" | "Mobile";
  tool: string | null;
  source_name: string | null;
  source_url: string | null;
  context: string | null;
  hypothesis: string | null;
  /** null cuando el resultado no es público: el test se muestra como catálogo y no se juega. */
  winner: VariantKey | null;
  metric: string | null;
  lift: number | null;
  confidence: number | null;
  summary: string | null;
  segments: Segment[];
  learnings: string[];
  ideas: string[];
  tags: string[];
  status: TestStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  // Datos del archivo importado
  source_id: string | null;
  page_type: string | null;
  pattern: string | null;
  pattern_number: number | null;
  author: string | null;
  tested_on: string | null;
  test_year: number | null;
  sample_size: string | null;
  duration: string | null;
  significance: string | null;
  revenue_impact: string | null;
  power_5pct: number | null;
  outcome: Outcome | null;
  results_locked: boolean;
  play_mode: PlayMode;
  doc_quality: number | null;
  review_flags: string[];
  variants: Variant[];
};

/** Lo que se muestra antes de votar: sin ganadora ni resultados. */
export type TestTeaser = Pick<Test, "id" | "slug" | "title" | "company" | "industry" | "category" | "device" | "status" | "published_at" | "tags" | "winner" | "lift" | "results_locked" | "play_mode">;

export const CATEGORIES = [
  "Navegación",
  "Precios",
  "Copy y mensajes",
  "CTA y botones",
  "Formularios",
  "Checkout",
  "Página de producto",
  "Landing page",
  "Prueba social",
  "Imágenes y video",
  "Email",
  "Mobile",
  "Onboarding",
  "Otro",
] as const;
