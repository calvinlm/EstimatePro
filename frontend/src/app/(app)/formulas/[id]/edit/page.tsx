import { FormulaEditor } from "@/components/formulas/formula-editor";

type EditFormulaPageProps = {
  params: {
    id: string;
  };
};

export default function EditFormulaPage({ params }: EditFormulaPageProps) {
  return <FormulaEditor formulaId={params.id} />;
}
