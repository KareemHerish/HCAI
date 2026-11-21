# Sehati — Health Information Navigator
> **Bilingual (Arabic & English | RTL/LTR) Strict Medical Education Retrieval-Augmented Generation (RAG) Web Application**

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-Backend-000000?logo=express&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?logo=tailwindcss&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-Ready-000000?logo=vercel&logoColor=white)

**صحتي / Sehati (Health Information Navigator)** is a bilingual medical education assistant built on a **strict, local-only Retrieval-Augmented Generation (RAG)** architecture. It explains general medical concepts, human anatomy, physiology, disease education, general symptom awareness, risk factors, prevention, and medical terminology **exclusively** using verified evidence retrieved from its pre-indexed local Knowledge Base.

> **Strict Medical Safety Scope:** Sehati is **NOT** a doctor, diagnostic tool, treatment planner, medication prescriber, or clinical decision support system. It never browses the live web during conversations and strictly blocks personal diagnosis, treatment plans, and drug dosage requests while immediately escalating medical emergencies.

---

## Key Features

- **Strict Grounded Medical Education (Local RAG):** Every educational answer is grounded strictly in pre-indexed evidence from approved public health authorities with expandable **Evidence Used** excerpts and **Verified Sources**.
- **Bilingual AR/EN + Egyptian Arabic Support:** Full RTL/LTR interface, automatic language detection, Egyptian Arabic normalization, and cross-lingual medical synonym expansion.
- **No-Guessing Clarification Flow:** If a user's question is vague, incomplete, or ambiguous (e.g., a single bare topic like `"الضغط"`), the system asks targeted clarifying questions instead of guessing—then resumes the full **Safety Filter → RAG** pipeline on the follow-up turn.
- **7-Way Safety Gate & Emergency Escalation:** Classifies queries across `SAFE_MEDICAL_EDUCATION`, `PERSONAL_DIAGNOSIS_REQUEST`, `TREATMENT_REQUEST`, `MEDICATION_REQUEST`, `OUT_OF_SCOPE`, `EMERGENCY`, and `AMBIGUOUS`. Emergency symptoms trigger immediate alerts with country-specific hotlines.
- **Fast & Resilient Generation (30s Budget):** Uses 3-wave staggered latency hedging across primary and fallback models inside a strict 30-second end-to-end timeout ceiling, plus a client-side vague-output fallback guard.
- **Voice Input & Accessibility:** Built-in microphone recording with bilingual Arabic/English speech transcription (`/api/transcribe`), Simple Explanation Mode, Dark/Light themes, adjustable font sizes, Interactive Guided Tour, Emergency Directory, and Patient Guide.
- **Privacy-First Local History:** Chat sessions are saved locally in the browser (`localStorage`) with zero server-side tracking or third-party data sharing.

---

## Architecture & 10-Stage Strict RAG Pipeline

```text
USER QUERY (Text or Voice Transcript)
   │
   ▼
[1] Domain & Intent Classifier (7 categories: SAFE_MEDICAL_EDUCATION, PERSONAL_DIAGNOSIS_REQUEST,
                                TREATMENT_REQUEST, MEDICATION_REQUEST, OUT_OF_SCOPE, EMERGENCY, AMBIGUOUS)
   │
   ▼
[2] Pre-Retrieval Deterministic Safety Filter
    ├── EMERGENCY            → Immediate Emergency Alert + Country Hotlines
    ├── DIAGNOSIS / MEDS /   → Safe Educational Refusal + Guidance to Consult a Physician
    │   TREATMENT / OUT_OF_SCOPE
    └── AMBIGUOUS            → Targeted Clarifying Questions (No Guessing; resumes on next turn)
   │
   ▼
[3] Query Processor (AR/EN detection, Egyptian Arabic normalization, medical synonyms,
                     multi-turn clarification & topic anchor inheritance)
   │
   ▼
[4] Multilingual Embeddings (gemini-embedding-2 + 256-dim cross-lingual local vector fallback)
   │
   ▼
[5] Local Hybrid Vector Store (Cosine Similarity + BM25 + Title/Topic Boost + Deduplication + Top-K)
   │
   ▼
[6] Evidence Validator (Source allowlist enforcement, relevance threshold, unsafe content & conflict check)
   │
   ▼
[7] Context Builder (Untrusted evidence framing + full document provenance + compact history window)
   │
   ▼
[8] Grounded LLM Generation (@google/genai with 3-wave staggered hedging & strict JSON schema)
   │
   ▼
[9] Post-Generation Validator (Zod schema validation, citation verification, safety leakage scan,
                               client-side vague/guessing output guard)
   │
   ▼
[10] Structured Bilingual Response (Direct Answer, Detailed Explanation, Expandable Evidence Used,
                                    Verified Sources, Educational Disclaimer, Follow-up Questions)
```

---

## Approved Knowledge Base Sources

All medical documents are ingested, cleaned, chunked, deduplicated, and indexed **offline** prior to runtime (`1,148` documents / `2,545` chunks currently indexed):

| Source | Authority / Origin | Indexed Chunks |
| :--- | :--- | :---: |
| **MedlinePlus** | U.S. National Library of Medicine (NLM / NIH) Health Topics | 1,878 |
| **World Health Organization (WHO)** | Official English & Arabic Fact Sheets | 545 |
| **NHS Conditions** | UK National Health Service Educational Condition Overviews | 62 |
| **TheArabicPile_Medical** | Curated Arabic General Medical Education Dataset (`premio-ai`) | 60 |
| **Total** | **1,148 verified documents** | **2,545** |

---

## API Reference

All endpoints are served locally by Express (`server.ts`) and on Vercel by the Serverless Function (`api/index.ts`), enforcing a unified **30-second** request ceiling:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/chat` (alias: `/chat`) | Runs the full strict RAG + safety pipeline and returns structured bilingual JSON (`success`, `clarification_required`, `emergency`, `diagnosis_request`, `treatment_request`, `medication_request`, `out_of_scope`, `insufficient_evidence`). |
| `POST` | `/api/transcribe` | Transcribes recorded Egyptian Arabic or English audio (`base64` + `mimeType`) into plain text. |
| `POST` | `/api/test-filter` | Runs the semantic & deterministic safety classifier standalone for diagnostics and testing. |
| `GET` | `/api/rag/stats` | Returns indexed knowledge base document/chunk counts and approved sources. |
| `GET` | `/api/safety-rules` | Returns the active grounded system prompt policy and source allowlist. |
| `GET` | `/api/emergency-contacts` | Returns international & regional emergency contact directory (Egypt, KSA, UAE, Jordan, US/CA, UK, EU). |
| `GET` | `/api/health` | Health check returning service status and loaded knowledge base counts. |

---

## Project Structure

```text
.
├── api/
│   └── index.ts                      # Vercel Serverless Function entry point
├── backend/
│   ├── app.ts                        # Shared Express app factory (local + Vercel)
│   ├── types.ts                      # Shared RAG types & Zod validation schemas
│   ├── config/
│   │   └── allowlist.ts              # Approved medical source allowlist
│   ├── pipeline/
│   │   ├── domainClassifier.ts       # 7-way AR/EN semantic domain & safety classifier
│   │   ├── safetyFilter.ts           # Pre-retrieval deterministic & semantic safety gate
│   │   ├── queryProcessor.ts         # Normalization, Egyptian Arabic, synonyms & multi-turn anchor
│   │   ├── embeddings.ts             # Multilingual embeddings (gemini-embedding-2 + local fallback)
│   │   ├── vectorStore.ts            # Local persistent hybrid vector + BM25 search engine
│   │   ├── evidenceValidator.ts      # Allowlist, relevance threshold & conflict validator
│   │   ├── contextBuilder.ts         # Provenance-aware untrusted evidence prompt builder
│   │   ├── answerGenerator.ts        # Grounded Gemini generator with 3-wave staggered hedging
│   │   ├── responseValidator.ts      # Post-generation Zod, citation & safety leakage validator
│   │   └── ragOrchestrator.ts        # End-to-end strict RAG orchestrator
│   └── routes/
│       └── chatRoutes.ts             # Express API routes (/api/chat, /api/transcribe, /api/health, etc.)
├── data/
│   ├── knowledge_base/
│   │   └── chunks.json               # Preprocessed, deduplicated medical chunks
│   └── vector_store/
│       └── index.json                # Persistent local vector index
├── frontend/
│   ├── main.tsx                      # React root entry point
│   ├── App.tsx                       # Bilingual RTL/LTR state, sessions & API orchestration
│   ├── index.css                     # Tailwind CSS v4 styles, fonts & theme tokens
│   ├── types/index.ts                # Frontend TypeScript interfaces & API_TIMEOUT_MS (30000ms)
│   ├── data/constants.ts             # Localized UI strings, guides & sample prompts
│   ├── utils/
│   │   └── chatResponseGuard.ts      # Client-side vague/guessing output fallback guard
│   └── components/
│       ├── Header.tsx                # Navigation, theme, font size, language switcher
│       ├── Sidebar.tsx               # Navigation sidebar & session switcher
│       ├── ChatView.tsx              # Main chat workspace, voice recording & quick prompts
│       ├── MessageItem.tsx           # Structured RAG card (Answer, Evidence, Sources, Follow-ups)
│       ├── EmergencyDirectoryView.tsx# Country-specific emergency numbers & red flags
│       ├── PatientGuideView.tsx      # Scope, medical literacy & safe usage guide
│       ├── AppearanceModal.tsx       # Theme, font size & simple-mode controls
│       ├── OnboardingGuideModal.tsx  # First-time user scope walkthrough
│       └── InteractiveGuidedTour.tsx # Step-by-step interactive product tour
├── public/
│   └── logo.png                      # Application brand logo & favicon
├── index.html                        # Vite HTML entry point
├── server.ts                         # Local full-stack Express + Vite server (Port 3000)
├── vercel.json                       # Vercel build, serverless function & rewrite config
├── .vercelignore                     # Excludes non-runtime files from Vercel uploads
├── .env.example                      # Environment variable template
├── package.json                      # Dependencies & npm scripts
└── tsconfig.json                     # TypeScript configuration
```

---

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite 8, Tailwind CSS v4, Lucide React, Motion |
| **Backend** | Node.js, Express 4, TypeScript (`tsx`), Zod 4 |
| **AI & Retrieval** | `@google/genai` (`gemini-3.1-flash-lite`, `gemini-4-hydrogen`, `gemini-embedding-2`, `gemini-3.5-transcribe`), Hybrid Cosine Similarity + BM25 Local Vector Store |
| **Deployment** | Local Express/Vite Dev Server (`port 3000`) & Vercel Serverless Functions (`api/index.ts`) |

---

## Getting Started (Local Development)

### 1. Prerequisites
- **Node.js** `v20+`
- **npm** `v10+`
- A valid **Gemini API Key**

### 2. Installation
```bash
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env` and add your key:
```bash
cp .env.example .env
```

```env
GEMINI_API_KEY="your_gemini_api_key"
```

### 4. Run the Application (Port 3000)
```bash
npm run dev
```
Open `http://localhost:3000` in your browser.

### Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the Express API + Vite frontend dev server on port `3000`. |
| `npm run build` | Builds the optimized production frontend bundle into `dist/`. |
| `npm run start` | Runs the production Node.js Express server (`server.ts`). |
| `npm run lint` | Runs TypeScript strict type-checking (`tsc --noEmit`). |

---

## Deploying to Vercel

This project is pre-configured for zero-friction full-stack deployment on **Vercel** via `vercel.json` and `api/index.ts`.

### Steps
1. Push the repository to **GitHub**, **GitLab**, or **Bitbucket**.
2. Go to [Vercel](https://vercel.com) → **Add New Project** → import your repository.
3. Keep the auto-detected settings from `vercel.json`:
   - **Framework Preset:** `Vite`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
4. Open **Project Settings → Environment Variables** and add:
   - `GEMINI_API_KEY` = `your_gemini_api_key`
5. Click **Deploy**.
6. Verify your live backend deployment by visiting:
   ```text
   https://<your-project>.vercel.app/api/health
   ```
   You should receive HTTP `200` with `"status": "healthy"`, `"knowledgeBaseDocuments": 1148`, and `"knowledgeBaseChunks": 2545`.

### How Vercel Configuration Works (`vercel.json`)
- **Serverless Express Handler:** All `/api/*` and `/chat` traffic rewrites to `api/index.ts`.
- **SPA Routing:** All non-API routes rewrite to `/index.html`.
- **Function Resources:** `maxDuration: 30` (matches the 30s app timeout ceiling) and `memory: 1024` MB.
- **Bundled Knowledge Base:** `includeFiles` explicitly packages `data/knowledge_base/chunks.json` and `data/vector_store/index.json` into the serverless bundle so local RAG works cleanly on cold starts.

> **Note on `maxDuration`:** Vercel Hobby and Pro plans both support up to `30s+` with Fluid Compute / Serverless settings; if a restricted plan caps function timeouts lower, adjust `maxDuration` accordingly in `vercel.json`.

---

## Privacy & Chat History Storage

- Conversations are stored **locally in the user's browser** using `localStorage` under the key `sehati_chat_sessions_v1`.
- Chat history persists after closing the tab or browser with **no automatic expiration**, and remains private to that specific browser and device.
- History is cleared only when the user deletes chats inside the app, clears browser site data, or uses Private/Incognito mode.

---

## Verification Before Deploy

Run the type checker and production build before deploying to Vercel:

```bash
npm run lint
npm run build
```

---

## Medical Disclaimer

All information provided by **صحتي / Sehati** is strictly for **general educational and informational purposes only**. It is **not** a substitute for professional medical advice, diagnosis, or treatment. Always consult a qualified physician or licensed healthcare provider with any questions regarding a medical condition, and call local emergency services immediately in case of an urgent medical emergency.
