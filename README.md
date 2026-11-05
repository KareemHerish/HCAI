# (Sehati) — Health Information Navigator 

> **Team:** Mavericks   
> **Live Demo:** ([https://sehati-app.vercel.app](https://sehati-new.vercel.app/))

---

## Overview

**صحتي (Sehati)** is an accessible, safety-first health information web application built with **React 19, TypeScript, Vite, Tailwind CSS v4, and Node.js/Express (Vercel Serverless)**. It provides evidence-based, educational health information and non-medicinal first aid guidance in **Egyptian Arabic** and **English**.

The system strictly adheres to the core principle of **Safety and Ethics**:
- 🛑 **Zero Clinical Diagnosis** — Never diagnoses diseases.
- 💊 **Zero Prescriptions or Dosages** — Strictly rejects requests for medication doses, pill quantities, or pharmaceutical plans.
- 🚨 **Instant Emergency Detection (< 5ms)** — Intercepts acute symptoms (chest pain, shortness of breath, severe hemorrhage, loss of consciousness) and immediately routes the user to human emergency services (Egyptian Ambulance `123`).

---

## Team

| Member |
|---|
| Yousef Eldebaky |
| Yousef Essam |
| Yousef Diab |
| Yehia Medhat |
| Kareem Salah |

---

## What It Does (Design Summary)

1. **Multi-Modal Interaction:** The user asks a health question by typing, selecting one of 6 clinical quick-reply cards, or speaking via **Voice Input (Speech-to-Text)**.
2. **Two-Tier Safety Pipeline:** 
   - **Tier 1 (Deterministic Input Filter):** Evaluates user queries using localized Egyptian and English clinical regex patterns before invoking any model.
   - **Tier 2 (LLM Prompt Guardrails):** Conditioned with strict medical safety system instructions enforcing brevity, empathy, and source transparency.
3. **Emergency Escalation (Red Flags):** Urgent symptoms bypass conversational waiting and trigger a prominent red emergency banner with a direct click-to-call button for `123` and nearby emergency contacts.
4. **Human Handover:** Direct directory access to national healthcare hotlines:
   - 🚑 **Egyptian Ambulance:** `123`
   - 🧪 **Cairo University National Poison Control Center:** `02-23640248`
   - 🏥 **Ministry of Health Emergency Hotline:** `137`
5. **Universal Accessibility (Shneiderman’s 8 Golden Rules):**
   - Three Arabic font options (Cairo, Alexandria, Amiri).
   - Adjustable font sizes (Normal, Large, Extra Large) for low-vision and elderly users.
   - Light, Dark, and High-Contrast modes.
   - Searchable, local session chat history with easy clearing.

---

## Safety Principle in the Pipeline

Safety and Ethics is the **Principle Feature** of Sehati, implemented at two critical stages:
