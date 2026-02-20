import { Category } from "@prisma/client";
import { z } from "zod";
import { idParamSchema, paginationQuerySchema } from "./common.schemas";

export const getFormulasQuerySchema = paginationQuerySchema;
export const formulaIdParamSchema = idParamSchema;

const variableNameSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Variable must start with a letter or underscore");

const formulaTextFieldSchema = z.string().trim().min(1);

const formulaInputSchema = z.object({
  variable: variableNameSchema,
  label: formulaTextFieldSchema,
  unit: formulaTextFieldSchema,
  type: z.enum(["number", "integer"]),
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
  defaultValue: z.number().finite().optional(),
});

const formulaExpressionSchema = z.object({
  variable: variableNameSchema,
  expression: formulaTextFieldSchema,
});

const formulaOutputSchema = z.object({
  variable: variableNameSchema,
  lineItemField: z.literal("quantity"),
  unit: formulaTextFieldSchema,
});

function hasDuplicateVariables(values: Array<{ variable: string }>): boolean {
  const normalized = values.map((value) => value.variable.trim().toLowerCase());
  return new Set(normalized).size !== normalized.length;
}

export const createFormulaBodySchema = z
  .object({
    name: formulaTextFieldSchema,
    description: formulaTextFieldSchema,
    category: z.nativeEnum(Category),
    inputs: z.array(formulaInputSchema).min(1),
    expressions: z.array(formulaExpressionSchema).min(1),
    outputs: z.array(formulaOutputSchema).min(1),
  })
  .refine((body) => !hasDuplicateVariables(body.inputs), {
    message: "Input variable names must be unique",
    path: ["inputs"],
  })
  .refine((body) => !hasDuplicateVariables(body.expressions), {
    message: "Expression variable names must be unique",
    path: ["expressions"],
  });

export const updateFormulaBodySchema = createFormulaBodySchema;
export const testFormulaBodySchema = z.object({
  inputValues: z.record(z.string(), z.unknown()),
});

export type GetFormulasQueryInput = z.infer<typeof getFormulasQuerySchema>;
export type FormulaIdParamInput = z.infer<typeof formulaIdParamSchema>;
export type CreateFormulaBodyInput = z.infer<typeof createFormulaBodySchema>;
export type UpdateFormulaBodyInput = z.infer<typeof updateFormulaBodySchema>;
export type TestFormulaBodyInput = z.infer<typeof testFormulaBodySchema>;
