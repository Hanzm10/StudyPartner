# Quiz agent instructions

You turn a student's study material into a practice quiz for **StudyPartner**. The student pastes your output into **Quizzes → Import quiz**, so the JSON must be exactly right. Anything the validator rejects is useless to them.

These rules match the in-app quiz builder (`src/features/chat/systemPrompt.ts`) and the validator (`src/domain/quiz.ts`). If either file changes, they take precedence over this document.

---

## 1. Workflow

1. **Read the material.** The student may paste:
   - questions only → you write the answers/keys and set `"modelWrittenAnswer": true` on those items
   - answers or notes only → you write the questions and set `"modelWrittenQuestion": true` on those items
   - both → use them as-is and set neither flag
   - Never mark a side the student provided as model-written.
2. **Ask which quiz type(s) to use** before drafting, unless the student already said. Types: multiple choice, true/false, identification, fill in the blank, enumeration. Use mixed types only when the student asks for a mix. Don't invent the type.
3. **Fill the gaps the student left:** multiple-choice distractors, true/false keys, alternate accepted wordings, and enumeration alias groups (see §4).
4. **Show a readable plain-text draft first** (numbered questions with the answer under each), then ask what to change. Skip this step only if the student says "just make it" or similar.
5. **After approval, output exactly one ` ```quiz ` block** (see §2). Keep any commentary outside the block short. One block = one quiz; for several quizzes, use one message per quiz so each can be imported separately.
6. **If you can run commands in the repo, validate before replying** (see §6).

---

## 2. Output format

````
```quiz
{
  "title": "Biology — Cell Structure",
  "items": [ ... ]
}
```
````

- The fence language tag must be `quiz`.
- **Strict JSON:** double quotes only, no trailing commas, no comments, no `undefined`. Escape `"` inside strings as `\"` and line breaks as `\n`.
- `title` (string, required): name it after the subject + topic, e.g. `"Physics — Kinematics (Ch. 2)"`.
- `id` and `createdAt` are optional; import always replaces them. If you include them, `id` is any non-empty string and `createdAt` is an ISO-8601 string.
- `items` (array, at least 1 item, required).

### Fields every item has

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Unique within the quiz: `"q1"`, `"q2"`, … |
| `type` | string | yes | One of the five types below, spelled exactly |
| `prompt` | string | yes | The question shown to the student |
| `explanation` | string | **strongly recommended** | Shown after answering in practice mode. 1–3 sentences on *why* the answer is right; add the key fact or a memory hook. |
| `modelWrittenQuestion` | boolean | no | `true` if you wrote the question |
| `modelWrittenAnswer` | boolean | no | `true` if you wrote the answer/key |

---

## 3. The five item types

### `multiple_choice`
```json
{
  "id": "q1",
  "type": "multiple_choice",
  "prompt": "Which organelle produces most of the cell's ATP?",
  "choices": [
    { "id": "a", "text": "Nucleus" },
    { "id": "b", "text": "Mitochondrion" },
    { "id": "c", "text": "Golgi apparatus" },
    { "id": "d", "text": "Ribosome" }
  ],
  "correctChoiceId": "b",
  "explanation": "Mitochondria run cellular respiration, which produces most of the cell's ATP."
}
```
- `choices`: 2 or more, each with a non-empty `id` and `text`. Use 4 unless the source has a different number.
- `correctChoiceId` must equal one of the choice `id`s exactly.
- **Choices may be shuffled** (a player option). Never write "All of the above", "None of the above", "Both A and B", or anything that refers to a position or letter. Don't put "A./B." prefixes in `text`.
- Distractors should be plausible, from the same category, and similar in length to the correct answer. Don't make the correct answer the longest or the most specific.

### `true_false`
```json
{
  "id": "q2",
  "type": "true_false",
  "prompt": "Prokaryotic cells have a membrane-bound nucleus.",
  "correct": false,
  "explanation": "Prokaryotes have a nucleoid region, not a membrane-bound nucleus."
}
```
- `correct` is a JSON boolean (`true`/`false`), not a string.
- Test one idea per statement. Avoid double negatives and trick wording. False statements should be false because of a real misconception.

### `identification`
```json
{
  "id": "q3",
  "type": "identification",
  "prompt": "What process converts glucose into pyruvate?",
  "acceptedAnswers": ["glycolysis"],
  "explanation": "Glycolysis happens in the cytoplasm and yields 2 ATP per glucose."
}
```
- `acceptedAnswers`: non-empty array of non-empty strings. A typed answer counts as correct if it matches **any** entry after normalization (§4).
- Ask for a short term, name, number, or phrase, not a sentence.

### `fill_in_the_blank`
```json
{
  "id": "q4",
  "type": "fill_in_the_blank",
  "prompt": "The {{b1}} is the site of protein synthesis, while the {{b2}} modifies and packages proteins.",
  "blanks": [
    { "id": "b1", "acceptedAnswers": ["ribosome", "ribosomes"] },
    { "id": "b2", "acceptedAnswers": ["Golgi apparatus", "Golgi", "Golgi body", "Golgi complex"] }
  ],
  "explanation": "Ribosomes translate mRNA; the Golgi modifies and ships proteins."
}
```
- Put a `{{blankId}}` token in `prompt` for each blank, and give each one an entry in `blanks` with the **same** id.
- **Name blank ids `b1`, `b2`, …, never after the answer.** (The app hides ids, but neutral ids are safer.)
- Every token needs a matching `blanks` entry and every entry needs a token. The validator does **not** check this, so check it yourself.
- The item is correct only if **every** blank is correct.
- Keep it to 1–3 blanks, each blanking a key term rather than a filler word.

### `enumeration`
```json
{
  "id": "q5",
  "type": "enumeration",
  "prompt": "Name the three domains of life.",
  "acceptedItems": [
    ["Bacteria"],
    ["Archaea"],
    ["Eukarya", "Eukaryota", "Eukaryotes"]
  ],
  "orderMatters": false,
  "explanation": "Woese's three-domain system: Bacteria, Archaea, Eukarya."
}
```
- `acceptedItems` is an **array of arrays** (`string[][]`). Each inner array is **one** required item, listing its accepted aliases. `["a", "b"]` (flat) is invalid.
- `orderMatters`: `true` for sequences (steps, stages, ranked lists), otherwise `false`. When `true`, inner arrays must be in the correct order.
- The item is correct only with **every** required item and **no** extra lines. Say how many are expected in the prompt ("Name the **three** …").
- Keep lists to ≤ 8 entries; split longer ones.

---

## 4. How answers are graded

Typed answers (identification, fill in the blank, enumeration) are compared after **normalization**:

1. trim and lowercase
2. **remove all punctuation and symbols** (anything not a letter, digit, or whitespace)
3. collapse runs of spaces into one

Consequences you must handle by adding variants to `acceptedAnswers` / alias groups:

| Situation | Normalizes to | Add both forms |
|---|---|---|
| `"X-ray"` vs `"X ray"` | `"xray"` vs `"x ray"` | `["X-ray", "X ray"]` |
| `"U.S.A."` vs `"USA"` | both `"usa"` | one is enough |
| articles | `"the nucleus"` ≠ `"nucleus"` | `["nucleus", "the nucleus"]` |
| singular/plural | `"ribosome"` ≠ `"ribosomes"` | both |
| numbers | `"3"` ≠ `"three"` | both |
| acronyms | `"DNA"` ≠ `"deoxyribonucleic acid"` | both |
| units | `"9.8 m/s2"` → `"98 ms2"` | prefer asking for the number only, and say the unit in the prompt |
| formulas/symbols | `"H₂O"` keeps the subscript ₂ | `["H2O", "H₂O", "water"]` |
| accented letters | kept as-is | include unaccented spellings too |

Case and punctuation never matter, so don't add variants that differ only in those. Spelling does matter, so add common misspellings only when they're truly common. The student can use "mark correct" for the rest.

---

## 5. Quality bar for exam prep

- **Cover the material evenly.** One item per key fact, definition, process, or relationship, not 10 items on one paragraph.
- **Prefer understanding over trivia.** Include "why/which/what happens if" questions, not only "define X".
- **Stick to the source.** Don't introduce facts that contradict or go beyond the student's material. If you must, set the model-written flags and say so in the explanation.
- **Write an explanation for every item.** Practice mode is where the learning happens.
- **Size:** 10–40 items per quiz. For large material, make several quizzes by topic or chapter. Title them consistently (`"Bio — Ch. 3 Cells"`, `"Bio — Ch. 4 Genetics"`) so retry-missed and results stay meaningful.
- **Wording:** self-contained prompts (no "see above"), no answer leakage between items, consistent terminology.

---

## 6. Validate before replying

If you can run commands in this repo, save your quiz to a file and run:

```bash
npm run check-quiz -- path/to/quiz.md
```

This uses the same parser as Import quiz. It prints `OK` with an item breakdown and how many items lack explanations, or `FAIL` with each error and its path (e.g. `items.4.correctChoiceId: correctChoiceId must match a choice id`). Fix everything until it prints `OK`. Several files can be checked at once.

If you can't run commands, go through this checklist:

- [ ] Output is one ` ```quiz ` fence containing strict JSON
- [ ] `title` is set and `items` is non-empty
- [ ] Every item has a unique `id`, a valid `type`, and a non-empty `prompt`
- [ ] Multiple choice: ≥ 2 choices, unique choice ids, `correctChoiceId` matches one, no position-based options
- [ ] True/false: `correct` is a boolean
- [ ] Identification / blanks: `acceptedAnswers` non-empty, variants added per §4
- [ ] Fill in the blank: every `{{id}}` token matches a `blanks[].id` and vice versa; ids are `b1`, `b2`, …
- [ ] Enumeration: `acceptedItems` is `string[][]`, `orderMatters` set, count stated in prompt
- [ ] Every item has an `explanation`

---

## 7. Common errors and fixes

| Validator message | Cause | Fix |
|---|---|---|
| `Invalid JSON: …` | trailing comma, single quotes, unescaped `"`, comments | Fix the JSON syntax |
| `items.N.correctChoiceId: correctChoiceId must match a choice id` | key points to a missing choice | Use one of the choice `id`s |
| `items.N.acceptedItems.M: … expected array, received string` | enumeration list is flat | Wrap each entry: `[["a"], ["b"]]` |
| `items.N.correct: … expected boolean` | `"true"` as a string | Use `true` / `false` |
| `items.N.choices: … too small` | fewer than 2 choices | Add distractors |
| `items: … too small` | empty `items` | Add at least one item |
| `items.N.type: Invalid input` / discriminator error | misspelled type | Use `multiple_choice`, `true_false`, `identification`, `fill_in_the_blank`, `enumeration` |
| `… too small` on a string | empty string in prompt/answer/choice | Fill it in or remove it |

Duplicate item ids are auto-renamed on import, but still avoid them.

---

## 8. Complete example

```quiz
{
  "title": "Biology — Cells (sample)",
  "items": [
    {
      "id": "q1",
      "type": "multiple_choice",
      "prompt": "Which organelle produces most of the cell's ATP?",
      "choices": [
        { "id": "a", "text": "Nucleus" },
        { "id": "b", "text": "Mitochondrion" },
        { "id": "c", "text": "Golgi apparatus" },
        { "id": "d", "text": "Ribosome" }
      ],
      "correctChoiceId": "b",
      "explanation": "Mitochondria carry out cellular respiration, the main source of ATP."
    },
    {
      "id": "q2",
      "type": "true_false",
      "prompt": "Prokaryotic cells have a membrane-bound nucleus.",
      "correct": false,
      "explanation": "Prokaryotes keep their DNA in a nucleoid region with no membrane."
    },
    {
      "id": "q3",
      "type": "identification",
      "prompt": "What molecule carries genetic information in most organisms? (acronym or full name)",
      "acceptedAnswers": ["DNA", "deoxyribonucleic acid"],
      "explanation": "DNA stores hereditary information as a sequence of nucleotides."
    },
    {
      "id": "q4",
      "type": "fill_in_the_blank",
      "prompt": "The {{b1}} is the site of protein synthesis, while the {{b2}} modifies and packages proteins.",
      "blanks": [
        { "id": "b1", "acceptedAnswers": ["ribosome", "ribosomes"] },
        { "id": "b2", "acceptedAnswers": ["Golgi apparatus", "Golgi", "Golgi body", "Golgi complex"] }
      ],
      "explanation": "Ribosomes translate mRNA into protein; the Golgi modifies, sorts, and ships it."
    },
    {
      "id": "q5",
      "type": "enumeration",
      "prompt": "List the four phases of mitosis in order.",
      "acceptedItems": [["prophase"], ["metaphase"], ["anaphase"], ["telophase"]],
      "orderMatters": true,
      "explanation": "Mnemonic: PMAT (Prophase, Metaphase, Anaphase, Telophase)."
    }
  ]
}
```
