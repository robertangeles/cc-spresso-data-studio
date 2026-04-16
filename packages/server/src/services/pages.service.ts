import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { logger } from '../config/logger.js';

export async function getPageBySlug(slug: string) {
  return db.query.pages.findFirst({
    where: eq(schema.pages.slug, slug),
  });
}

export async function listPages() {
  return db.query.pages.findMany({
    orderBy: schema.pages.title,
  });
}

export async function updatePage(
  slug: string,
  data: { title?: string; body?: string; isPublished?: boolean },
) {
  const existing = await getPageBySlug(slug);
  if (!existing) return null;

  const [updated] = await db
    .update(schema.pages)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.pages.slug, slug))
    .returning();

  return updated;
}

export async function seedPages() {
  const pagesToSeed = [
    { slug: 'privacy', title: 'Privacy Policy', body: PRIVACY_CONTENT },
    { slug: 'terms', title: 'Terms of Service', body: TERMS_CONTENT },
  ];

  for (const page of pagesToSeed) {
    const existing = await getPageBySlug(page.slug);
    if (!existing) {
      await db.insert(schema.pages).values(page);
      logger.info({ slug: page.slug }, 'Seeded page');
    } else if (existing.body !== page.body) {
      await db
        .update(schema.pages)
        .set({ body: page.body, title: page.title, updatedAt: new Date() })
        .where(eq(schema.pages.slug, page.slug));
      logger.info({ slug: page.slug }, 'Updated seeded page');
    }
  }
}

// ── Privacy Policy content (markdown) ──────────────────────

const PRIVACY_CONTENT = `# Privacy Policy

**Last updated: 16 April 2026**

## 1. About This Policy

Spresso Data Studio ("we", "us", "our") is an Australian company operating the data modelling platform at spresso.xyz. We are committed to protecting your personal information in accordance with the Privacy Act 1988 (Cth) and the Australian Privacy Principles (APPs).

This policy explains how we collect, use, disclose, and store your personal information when you use our platform.

## 2. Information We Collect

We collect the following types of personal information:

- **Account information:** name, email address, and password when you register.
- **Profile information:** avatar and workspace preferences you configure.
- **Payment information:** processed securely by Stripe. We do not store your credit card details.
- **Data models and schemas:** DDL, schema definitions, data models, documentation, and other artefacts you create, generate, or upload through the platform.
- **Usage data:** AI model usage, token counts, feature interactions, and session information.
- **Technical data:** IP address, browser type, and device information collected automatically.

## 3. How We Use Your Information

We use your personal information to:

- Provide, maintain, and improve the Spresso Data Studio platform.
- Process your subscription payments and manage your account.
- Generate data models, ERDs, data dictionaries, and other artefacts via AI on your behalf.
- Track usage for billing, credit allocation, and service optimisation.
- Send transactional emails (account verification, billing notifications).
- Respond to your enquiries and provide customer support.

## 4. Third-Party Services

We share your information with the following categories of third-party service providers:

- **AI providers (OpenRouter):** your schema inputs and prompts are sent to AI models for data model generation. OpenRouter routes requests to providers such as Anthropic, OpenAI, Google, Mistral, and others. Data is processed according to each provider's data handling policies.
- **Payment processing (Stripe):** payment and subscription data is processed by Stripe Inc.
- **Email delivery (Resend):** transactional emails are sent via Resend.
- **Hosting (Render):** our application and database are hosted on Render's infrastructure.
- **Media storage (Cloudinary):** uploaded images are stored and served via Cloudinary.

We do not sell your personal information to any third party.

## 5. Data Storage and Security

Your data is stored on servers located in the United States (Render infrastructure). By using Spresso Data Studio, you consent to the transfer of your data to these overseas facilities. We take reasonable steps to ensure that overseas recipients handle your data in accordance with the APPs.

We implement industry-standard security measures including encrypted connections (HTTPS/TLS), hashed passwords (bcrypt), HTTP-only secure cookies, and role-based access controls.

## 6. Cookies

We use essential cookies for authentication (refresh tokens stored as HTTP-only secure cookies). We do not use third-party tracking cookies or advertising cookies. No cookie consent banner is required as we only use strictly necessary cookies.

## 7. Your Rights

Under the Australian Privacy Principles, you have the right to:

- Access the personal information we hold about you.
- Request correction of inaccurate or incomplete information.
- Request deletion of your account and associated data.
- Withdraw consent for specific data processing activities.
- Lodge a complaint with the Office of the Australian Information Commissioner (OAIC) if you believe we have breached the APPs.

To exercise any of these rights, contact us at privacy@spresso.xyz.

## 8. Data Retention

We retain your personal information for as long as your account is active or as needed to provide you with our services. When you delete your account, we delete your personal data within 30 days, except where we are required by law to retain it.

## 9. Children's Privacy

Spresso Data Studio is not intended for use by individuals under the age of 18. We do not knowingly collect personal information from children.

## 10. Changes to This Policy

We may update this privacy policy from time to time. We will notify you of material changes by posting the updated policy on our website and updating the "Last updated" date above.

## 11. Contact Us

If you have questions about this privacy policy or our data practices, contact us at:

**Email:** privacy@spresso.xyz
**Website:** spresso.xyz`;

// ── Terms of Service content (markdown) ────────────────────

const TERMS_CONTENT = `# Terms of Service

**Last updated: 16 April 2026**

## 1. Agreement

By accessing or using Spresso Data Studio ("the Platform") at spresso.xyz, you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, you must not use the Platform. Spresso Data Studio is operated from Australia and governed by Australian law.

## 2. Eligibility

You must be at least 18 years of age to use Spresso Data Studio. By creating an account, you represent that you meet this age requirement and that the information you provide is accurate and complete.

## 3. Account Responsibilities

You are responsible for:

- Maintaining the confidentiality of your account credentials.
- All activities that occur under your account.
- Notifying us immediately of any unauthorised use of your account.

We reserve the right to suspend or terminate accounts that violate these Terms.

## 4. Subscriptions and Payments

Spresso Data Studio offers free and paid subscription plans. Paid subscriptions are billed in advance on a recurring basis through Stripe. By subscribing to a paid plan, you authorise us to charge your payment method.

- Prices are listed in USD and may change with 30 days' notice.
- You may cancel your subscription at any time. Cancellation takes effect at the end of the current billing period.
- Refunds are provided at our discretion and in accordance with Australian Consumer Law.
- Under Australian Consumer Law, you have consumer guarantee rights that cannot be excluded.

## 5. AI-Generated Artefacts

Spresso Data Studio uses third-party AI models (accessed via OpenRouter) to generate data models, schemas, ERDs, data dictionaries, and other artefacts on your behalf. By using the Platform, you acknowledge that:

- AI-generated artefacts may contain errors, inaccuracies, or suboptimal design choices. You are responsible for reviewing and validating all generated output before use in production systems.
- Your input schemas, DDL, and prompts are sent to third-party AI providers for processing. See our Privacy Policy for details.
- We do not guarantee that AI-generated output is free from errors or suitable for any particular purpose.
- You are solely responsible for ensuring that data models and schemas you deploy comply with your organisation's governance, security, and regulatory requirements.

## 6. Content Ownership

You retain ownership of all schemas, data models, documentation, and other artefacts you create, upload, or generate through the Platform, including AI-assisted output. By using Spresso Data Studio, you grant us a limited, non-exclusive licence to store, process, and transmit your data solely for the purpose of providing the Platform's services to you.

We do not claim ownership of your data or models and will not use them for purposes other than providing our services, unless you explicitly consent.

## 7. Acceptable Use

You agree not to use the Platform to:

- Generate, store, or distribute artefacts that are unlawful or that violate third-party rights.
- Infringe on the intellectual property rights of any third party.
- Attempt to gain unauthorised access to our systems or other users' accounts.
- Reverse-engineer, decompile, or disassemble any part of the Platform.
- Resell, sublicence, or commercially redistribute access to the Platform without our written permission.

## 8. Service Availability

We aim to provide reliable access to the Platform but do not guarantee uninterrupted or error-free service. We may perform maintenance, updates, or modifications that temporarily affect availability. We are not liable for any loss arising from service interruptions.

## 9. Limitation of Liability

To the maximum extent permitted by Australian law, Spresso Data Studio's liability to you for any claim arising from or related to your use of the Platform is limited to the amount you paid us in the 12 months preceding the claim.

Nothing in these Terms excludes, restricts, or modifies any consumer guarantee, right, or remedy conferred by the Australian Consumer Law (Schedule 2 of the Competition and Consumer Act 2010) or any other applicable law that cannot be excluded, restricted, or modified by agreement.

## 10. Indemnification

You agree to indemnify and hold harmless Spresso Data Studio and its officers, directors, and employees from any claims, damages, or expenses arising from your use of the Platform, your data, or your violation of these Terms.

## 11. Termination

We may suspend or terminate your account at any time for violation of these Terms, with or without notice. Upon termination, your right to use the Platform ceases immediately. Provisions that by their nature should survive termination (including ownership, indemnification, and limitation of liability) will survive.

## 12. Governing Law

These Terms are governed by and construed in accordance with the laws of the State of Victoria, Australia. Any disputes arising under these Terms will be subject to the exclusive jurisdiction of the courts of Victoria.

## 13. Changes to These Terms

We may update these Terms from time to time. We will notify you of material changes by posting the updated Terms on our website. Continued use of the Platform after changes constitutes acceptance of the updated Terms.

## 14. Contact Us

If you have questions about these Terms, contact us at:

**Email:** support@spresso.xyz
**Website:** spresso.xyz`;
