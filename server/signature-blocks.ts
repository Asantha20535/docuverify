export interface SignatureBlockDefinition {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
}

type TemplateSignatureBlocks = Record<string, Record<string, SignatureBlockDefinition>>;

const LETTER_WIDTH = 612; // 8.5in * 72
const COLUMN_WIDTH = 150;
const COLUMN_GAP = 18;
const LEFT_MARGIN = 48;

const createRow = (startY: number, roles: string[]): Record<string, SignatureBlockDefinition> => {
  return roles.reduce<Record<string, SignatureBlockDefinition>>((acc, role, index) => {
    const x = LEFT_MARGIN + index * (COLUMN_WIDTH + COLUMN_GAP);
    if (x + COLUMN_WIDTH <= LETTER_WIDTH - LEFT_MARGIN) {
      acc[role] = {
        page: 0,
        x,
        y: startY,
        width: COLUMN_WIDTH,
        height: 56,
      };
    }
    return acc;
  }, {});
};

const defaultLayout = (() => {
  const topRow = createRow(190, ["course_unit", "academic_staff", "department_head"]);
  const bottomRow = createRow(110, ["dean", "assistant_registrar", "vice_chancellor"]);
  return { ...topRow, ...bottomRow };
})();

const transcriptLayout = (() => {
  const topRow = createRow(220, ["academic_staff", "department_head", "dean"]);
  const midRow = createRow(150, ["assistant_registrar", "vice_chancellor"]);
  const bottomRow = createRow(80, ["course_unit"]);
  return { ...topRow, ...midRow, ...bottomRow };
})();

const enrollmentLayout = (() => {
  const topRow = createRow(210, ["course_unit", "academic_staff"]);
  const midRow = createRow(140, ["department_head", "dean"]);
  const bottomRow = createRow(70, ["assistant_registrar"]);
  return { ...topRow, ...midRow, ...bottomRow };
})();

const gradeReportLayout = (() => {
  const row = createRow(160, ["academic_staff", "department_head", "dean"]);
  return { ...row, assistant_registrar: { page: 0, x: LEFT_MARGIN, y: 90, width: COLUMN_WIDTH, height: 56 } };
})();

const signatureLayouts: TemplateSignatureBlocks = {
  default: defaultLayout,
  transcript_request: transcriptLayout,
  enrollment_verification: enrollmentLayout,
  grade_report: gradeReportLayout,
  academic_record: defaultLayout,
  certificate_verification: enrollmentLayout,
  letter_of_recommendation: gradeReportLayout,
  degree_verification: enrollmentLayout,
  other: defaultLayout,
};

export function getSignatureBlockForRole(documentType: string, role: string): SignatureBlockDefinition | undefined {
  const normalizedRole = role.toLowerCase();
  const templateBlocks = signatureLayouts[documentType] ?? signatureLayouts.default;
  return templateBlocks?.[normalizedRole] ?? signatureLayouts.default?.[normalizedRole];
}

