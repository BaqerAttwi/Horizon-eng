const { z } = require('zod');

const schemas = {
  login: z.object({
    email: z.string().email('Invalid email'),
    password: z.string().min(1, 'Password required'),
  }),
  register: z.object({
    name: z.string().min(1, 'Name required'),
    email: z.string().email('Invalid email'),
    role: z.enum(['owner', 'head_engineer', 'stock_manager', 'accounting', 'engineer', 'secretary', 'technician']),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    phone: z.string().optional().nullable(),
  }),
  createClient: z.object({
    name: z.string().min(1, 'Client name required'),
    type: z.enum(['individual', 'company']).optional().default('individual'),
    tax_id: z.string().optional().nullable(),
    credit_limit: z.union([z.number(), z.string()]).pipe(z.coerce.number()).optional().nullable(),
    phone: z.string().optional().nullable(),
    email: z.string().email().optional().nullable().or(z.literal('')),
    address: z.string().optional().nullable(),
  }),
  createWorker: z.object({
    name: z.string().min(1, 'Name required'),
    email: z.string().email().optional().nullable().or(z.literal('')),
    phone: z.string().optional().nullable(),
    role: z.enum(['owner', 'head_engineer', 'stock_manager', 'accounting', 'engineer', 'secretary', 'technician']),
    password: z.string().min(6, 'Password must be at least 6 characters'),
  }),
  createDiscount: z.object({
    product_id: z.union([z.number(), z.string()]).pipe(z.coerce.number()).optional().nullable(),
    brand_id: z.union([z.number(), z.string()]).pipe(z.coerce.number()).optional().nullable(),
    discount_pct: z.union([z.number(), z.string()]).pipe(z.coerce.number()).optional().default(0),
    notes: z.string().optional().nullable(),
  }).refine(d => d.product_id || d.brand_id, { message: 'product_id or brand_id required' }),
  createProject: z.object({
    project_name: z.string().min(1, 'Project name required'),
    quote_number: z.string().trim().max(100).optional().nullable(),
    engineer_id: z.union([z.number(), z.string()]).pipe(z.coerce.number()).optional().nullable(),
    exchange_rate_eur_usd: z.union([z.number(), z.string()]).pipe(z.coerce.number()).optional(),
    client_id: z.union([z.number(), z.string()]).pipe(z.coerce.number()).optional().nullable(),
    deadline: z.string().optional().nullable(),
    total_panels: z.union([z.number(), z.string()]).pipe(z.coerce.number().int().positive()).optional(),
  }),
};

function validate(schemaName) {
  const schema = schemas[schemaName];
  if (!schema) throw new Error(`Unknown validation schema: ${schemaName}`);

  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
      return res.status(400).json({ error: `Validation failed: ${errors}` });
    }
    req.body = result.data;
    next();
  };
}

module.exports = { validate, schemas };
