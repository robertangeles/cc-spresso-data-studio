import { brand_guidelines_skill } from './brand-guidelines.js';
import { canvas_design_skill } from './canvas-design.js';
import { doc_coauthoring_skill } from './doc-coauthoring.js';
import { docx_skill } from './docx.js';
import { frontend_design_skill } from './frontend-design.js';
import { internal_comms_skill } from './internal-comms.js';
import { pdf_skill } from './pdf.js';
import { pptx_skill } from './pptx.js';

/**
 * Default skills bundled from Anthropic's skills repo (github.com/anthropics/skills).
 * These are copied into each new user's account on registration.
 */
export const defaultUserSkills = [
  brand_guidelines_skill,
  canvas_design_skill,
  doc_coauthoring_skill,
  docx_skill,
  frontend_design_skill,
  internal_comms_skill,
  pdf_skill,
  pptx_skill,
];
