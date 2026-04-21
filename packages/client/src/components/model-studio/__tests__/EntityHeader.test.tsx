// @vitest-environment jsdom
import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EntityHeader } from '../EntityHeader';

afterEach(() => cleanup());

/**
 * EntityHeader — Step 6 Direction A. Three smoke cases covering the
 * three layer-casing branches; a fourth for display-id rendering; a
 * fifth for the lint-violation underline. Direct DOM assertions via
 * `getByText` so the test reads like the design brief.
 */

describe('EntityHeader — layer-appropriate casing', () => {
  it('physical layer renders lowercase snake_case', () => {
    render(
      <EntityHeader
        name="EMPLOYEE"
        businessName={null}
        layer="physical"
        displayId={null}
        hasLintViolation={false}
      />,
    );
    expect(screen.getByText('employee')).toBeTruthy();
  });

  it('logical layer renders Title Case', () => {
    render(
      <EntityHeader
        name="employee_name"
        businessName={null}
        layer="logical"
        displayId={null}
        hasLintViolation={false}
      />,
    );
    expect(screen.getByText('Employee Name')).toBeTruthy();
  });

  it('conceptual layer renders Sentence case', () => {
    render(
      <EntityHeader
        name="EMPLOYEE_NAME"
        businessName={null}
        layer="conceptual"
        displayId={null}
        hasLintViolation={false}
      />,
    );
    expect(screen.getByText('Employee name')).toBeTruthy();
  });
});

describe('EntityHeader — displayId chip', () => {
  it('renders the chip when displayId is provided', () => {
    render(
      <EntityHeader
        name="employee"
        businessName={null}
        layer="physical"
        displayId="E007"
        hasLintViolation={false}
      />,
    );
    const chip = screen.getByTestId('entity-header-display-id');
    expect(chip.textContent).toBe('E007');
  });

  it('omits the chip when displayId is null', () => {
    render(
      <EntityHeader
        name="employee"
        businessName={null}
        layer="physical"
        displayId={null}
        hasLintViolation={false}
      />,
    );
    expect(screen.queryByTestId('entity-header-display-id')).toBeNull();
  });
});

describe('EntityHeader — lint violation', () => {
  it('underlines the name when hasLintViolation is true', () => {
    render(
      <EntityHeader
        name="employee"
        businessName={null}
        layer="physical"
        displayId={null}
        hasLintViolation
      />,
    );
    const name = screen.getByTestId('entity-node-name');
    expect(name.className).toContain('underline');
    expect(name.className).toContain('decoration-amber-400');
  });
});
