import { z } from 'zod'

const choiceSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
})

const modelFlagsSchema = z.object({
  modelWrittenQuestion: z.boolean().optional(),
  modelWrittenAnswer: z.boolean().optional(),
})

const baseItemSchema = z
  .object({
    id: z.string().min(1),
    prompt: z.string().min(1),
    explanation: z.string().optional(),
  })
  .merge(modelFlagsSchema)

export const multipleChoiceItemSchema = baseItemSchema
  .extend({
    type: z.literal('multiple_choice'),
    choices: z.array(choiceSchema).min(2),
    correctChoiceId: z.string().min(1),
  })
  .superRefine((item, ctx) => {
    if (!item.choices.some((choice) => choice.id === item.correctChoiceId)) {
      ctx.addIssue({
        code: 'custom',
        message: 'correctChoiceId must match a choice id',
        path: ['correctChoiceId'],
      })
    }
  })

export const trueFalseItemSchema = baseItemSchema.extend({
  type: z.literal('true_false'),
  correct: z.boolean(),
})

export const identificationItemSchema = baseItemSchema.extend({
  type: z.literal('identification'),
  acceptedAnswers: z.array(z.string().min(1)).min(1),
})

export const blankSchema = z.object({
  id: z.string().min(1),
  acceptedAnswers: z.array(z.string().min(1)).min(1),
})

export const fillInTheBlankItemSchema = baseItemSchema.extend({
  type: z.literal('fill_in_the_blank'),
  blanks: z.array(blankSchema).min(1),
})

export const enumerationItemSchema = baseItemSchema.extend({
  type: z.literal('enumeration'),
  acceptedItems: z.array(z.array(z.string().min(1)).min(1)).min(1),
  orderMatters: z.boolean().default(false),
})

export const quizItemSchema = z.discriminatedUnion('type', [
  multipleChoiceItemSchema,
  trueFalseItemSchema,
  identificationItemSchema,
  fillInTheBlankItemSchema,
  enumerationItemSchema,
])

export const quizSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  createdAt: z.string().min(1),
  items: z.array(quizItemSchema).min(1),
})

export type Choice = z.infer<typeof choiceSchema>
export type MultipleChoiceItem = z.infer<typeof multipleChoiceItemSchema>
export type TrueFalseItem = z.infer<typeof trueFalseItemSchema>
export type IdentificationItem = z.infer<typeof identificationItemSchema>
export type Blank = z.infer<typeof blankSchema>
export type FillInTheBlankItem = z.infer<typeof fillInTheBlankItemSchema>
export type EnumerationItem = z.infer<typeof enumerationItemSchema>
export type QuizItem = z.infer<typeof quizItemSchema>
export type Quiz = z.infer<typeof quizSchema>
export type QuizItemType = QuizItem['type']

export function parseQuiz(data: unknown): Quiz {
  return quizSchema.parse(data)
}

export function safeParseQuiz(data: unknown) {
  return quizSchema.safeParse(data)
}
