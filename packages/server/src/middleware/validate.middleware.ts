import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';
import { ValidationError } from '../utils/errors.js';

type ReqSource = 'body' | 'params' | 'query';

function collectIssues(
  error: { issues: Array<{ path: (string | number)[]; message: string }> },
  prefix = '',
): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = prefix + issue.path.join('.');
    if (!details[key]) details[key] = [];
    details[key].push(issue.message);
  }
  return details;
}

function runValidator(schema: ZodSchema, source: ReqSource) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      throw new ValidationError(collectIssues(result.error, source === 'body' ? '' : `${source}.`));
    }
    // Only rewrite body — params/query are read-only on the Express request
    // in TS land and rewriting them causes downstream type confusion.
    if (source === 'body') req.body = result.data;
    next();
  };
}

export function validate(schema: ZodSchema) {
  return runValidator(schema, 'body');
}

export function validateParams(schema: ZodSchema) {
  return runValidator(schema, 'params');
}

export function validateQuery(schema: ZodSchema) {
  return runValidator(schema, 'query');
}
