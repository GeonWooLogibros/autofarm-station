export type CmpOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'not in'
export type BinOp = '+' | '-' | '*' | '/' | '//' | '%' | '**'

export type Expr =
  | { t: 'Num'; v: number; line: number }
  | { t: 'Str'; v: string; line: number }
  | { t: 'Const'; v: true | false | null; line: number }
  | { t: 'Name'; id: string; line: number }
  | { t: 'List'; items: Expr[]; line: number }
  | { t: 'Tuple'; items: Expr[]; line: number }
  | { t: 'Dict'; entries: [Expr, Expr][]; line: number }
  | { t: 'Unary'; op: '-' | 'not'; e: Expr; line: number }
  | { t: 'Bin'; op: BinOp; l: Expr; r: Expr; line: number }
  | { t: 'Bool'; op: 'and' | 'or'; l: Expr; r: Expr; line: number }
  | { t: 'Cmp'; first: Expr; rest: { op: CmpOp; e: Expr }[]; line: number }
  | { t: 'Call'; fn: Expr; args: Expr[]; line: number }
  | { t: 'Index'; obj: Expr; idx: Expr; line: number }
  | { t: 'Attr'; obj: Expr; name: string; line: number }

export type Stmt =
  | { t: 'Expr'; e: Expr; line: number }
  | { t: 'Assign'; target: Expr; value: Expr; line: number }
  | { t: 'Aug'; target: Expr; op: BinOp; value: Expr; line: number }
  | { t: 'If'; branches: { cond: Expr; body: Stmt[] }[]; orelse: Stmt[]; line: number }
  | { t: 'While'; cond: Expr; body: Stmt[]; line: number }
  | { t: 'For'; name: string; iter: Expr; body: Stmt[]; line: number }
  | { t: 'Def'; name: string; params: string[]; body: Stmt[]; line: number }
  | { t: 'Return'; value: Expr | null; line: number }
  | { t: 'Break'; line: number }
  | { t: 'Continue'; line: number }
  | { t: 'Pass'; line: number }
  | { t: 'Global'; names: string[]; line: number }
