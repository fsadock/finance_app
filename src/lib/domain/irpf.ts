/**
 * IRPF (Brazilian income tax) reference data. Values are the ones in force for recent
 * ano-calendário years — confirm against the Receita Federal rules for the year you declare.
 */
export const IRPF_TYPES = {
  MEDICAL: { label: "Despesas médicas", hint: "Sem limite. Planos de saúde, consultas, exames, hospitais, dentistas, psicólogos. Farmácia não é dedutível (salvo em conta hospitalar)." },
  EDUCATION: { label: "Instrução", hint: "Limite anual por pessoa (titular e cada dependente). Ensino infantil a pós-graduação e técnico. Cursos livres, idiomas e material escolar não entram." },
  PENSION: { label: "Previdência privada (PGBL)", hint: "Dedutível até 12% da renda tributável, só no modelo completo e para quem contribui ao INSS. VGBL não é dedutível." },
  ALIMONY: { label: "Pensão alimentícia judicial", hint: "Sem limite quando fixada judicialmente ou por escritura pública." },
} as const;

export type IrpfType = keyof typeof IRPF_TYPES;

/** Reference cap for education per person (R$/ano). */
export const IRPF_EDUCATION_CAP = 3561.5;
/** PGBL deduction cap as a share of taxable income. */
export const IRPF_PENSION_CAP_RATE = 0.12;

export function isIrpfType(v: string | null | undefined): v is IrpfType {
  return !!v && v in IRPF_TYPES;
}
