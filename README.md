# StudyPartner

Turn study material into practice quizzes, then drill them until they stick.

- **Quiz builder chat**: paste questions, answers, or notes and an AI drafts a quiz (OpenAI, Anthropic, xAI, Gemini, or any OpenAI-compatible endpoint).
- **Import quiz**: paste a quiz made in another chat; no API key needed.
- **Quiz types**: multiple choice, true/false, identification, fill in the blank, enumeration.
- **Practice mode**: see the answer and explanation after each question.
- **Shuffle questions and choices**, plus keyboard shortcuts.
- **Results**: score, timing, accuracy by type, "mark correct" overrides, retry missed questions, optional AI study summary.
- **Light and dark mode.**

All data stays in your browser's localStorage. API keys are only sent to the local forwarder (`/api/chat`), which relays them to the provider.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

Or the production build:

```bash
npm run build
npm start          # http://localhost:4173
```

Add an API key in **Settings** to use the chat builder, or skip it and use **Quizzes → Import quiz**.

## Develop

```bash
npm test
npm run lint
```
