import { Link } from 'react-router-dom';

export function TermsPage() {
  return (
    <div className="min-h-screen bg-surface-0">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link to="/" className="text-sm text-accent hover:underline mb-8 inline-block">
          &larr; Back to Spresso
        </Link>

        <h1 className="text-3xl font-bold text-text-primary mb-2">Terms of Service</h1>
        <p className="text-sm text-text-tertiary mb-10">Last updated: 12 April 2026</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-text-secondary">
          <section>
            <h2 className="text-lg font-semibold text-text-primary mt-8 mb-3">1. Agreement</h2>
            <p>
              By accessing or using Spresso (&ldquo;the Platform&rdquo;) at spresso.xyz, you agree
              to be bound by these Terms of Service (&ldquo;Terms&rdquo;). If you do not agree to
              these Terms, you must not use the Platform. Spresso is operated from Australia and
              governed by Australian law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mt-8 mb-3">2. Eligibility</h2>
            <p>
              You must be at least 18 years of age to use Spresso. By creating an account, you
              represent that you meet this age requirement and that the information you provide is
              accurate and complete.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mt-8 mb-3">
              3. Account Responsibilities
            </h2>
            <p>You are responsible for:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Maintaining the confidentiality of your account credentials.</li>
              <li>All activities that occur under your account.</li>
              <li>Notifying us immediately of any unauthorised use of your account.</li>
            </ul>
            <p>We reserve the right to suspend or terminate accounts that violate these Terms.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mt-8 mb-3">
              4. Subscriptions and Payments
            </h2>
            <p>
              Spresso offers free and paid subscription plans. Paid subscriptions are billed in
              advance on a recurring basis through Stripe. By subscribing to a paid plan, you
              authorise us to charge your payment method.
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Prices are listed in USD and may change with 30 days&apos; notice.</li>
              <li>
                You may cancel your subscription at any time. Cancellation takes effect at the end
                of the current billing period.
              </li>
              <li>
                Refunds are provided at our discretion and in accordance with Australian Consumer
                Law.
              </li>
              <li>
                Under Australian Consumer Law, you have consumer guarantee rights that cannot be
                excluded.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mt-8 mb-3">
              5. AI-Generated Content
            </h2>
            <p>
              Spresso uses third-party AI models (accessed via OpenRouter) to generate content on
              your behalf. By using the Platform, you acknowledge that:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                AI-generated content may contain errors, inaccuracies, or biases. You are
                responsible for reviewing all generated content before publishing.
              </li>
              <li>
                Your input prompts and content are sent to third-party AI providers for processing.
                See our{' '}
                <Link to="/privacy" className="text-accent hover:underline">
                  Privacy Policy
                </Link>{' '}
                for details.
              </li>
              <li>
                We do not guarantee that AI-generated content is original, non-infringing, or
                suitable for any particular purpose.
              </li>
              <li>
                You are solely responsible for ensuring that content you publish complies with
                applicable laws, including defamation, copyright, and consumer protection laws.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mt-8 mb-3">
              6. Content Ownership
            </h2>
            <p>
              You retain ownership of all content you create, upload, or generate through the
              Platform, including AI-assisted content. By using Spresso, you grant us a limited,
              non-exclusive licence to store, process, and transmit your content solely for the
              purpose of providing the Platform&apos;s services to you.
            </p>
            <p>
              We do not claim ownership of your content and will not use it for purposes other than
              providing our services, unless you explicitly consent.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mt-8 mb-3">7. Acceptable Use</h2>
            <p>You agree not to use the Platform to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                Generate, store, or distribute content that is unlawful, defamatory, harassing, or
                obscene.
              </li>
              <li>Infringe on the intellectual property rights of any third party.</li>
              <li>
                Attempt to gain unauthorised access to our systems or other users&apos; accounts.
              </li>
              <li>Reverse-engineer, decompile, or disassemble any part of the Platform.</li>
              <li>
                Use the Platform to send spam or unsolicited communications via connected social
                media accounts.
              </li>
              <li>
                Resell, sublicence, or commercially redistribute access to the Platform without our
                written permission.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mt-8 mb-3">
              8. Social Media Integrations
            </h2>
            <p>
              When you connect third-party social media accounts (e.g., Pinterest, LinkedIn, X,
              Facebook, Instagram, Bluesky), you authorise Spresso to publish content on your
              behalf. You are responsible for:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Ensuring you have the right to publish content on connected accounts.</li>
              <li>Complying with each platform&apos;s terms of service.</li>
              <li>Managing and revoking access to connected accounts as needed.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mt-8 mb-3">
              9. Service Availability
            </h2>
            <p>
              We aim to provide reliable access to the Platform but do not guarantee uninterrupted
              or error-free service. We may perform maintenance, updates, or modifications that
              temporarily affect availability. We are not liable for any loss arising from service
              interruptions.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mt-8 mb-3">
              10. Limitation of Liability
            </h2>
            <p>
              To the maximum extent permitted by Australian law, Spresso&apos;s liability to you for
              any claim arising from or related to your use of the Platform is limited to the amount
              you paid us in the 12 months preceding the claim.
            </p>
            <p>
              Nothing in these Terms excludes, restricts, or modifies any consumer guarantee, right,
              or remedy conferred by the Australian Consumer Law (Schedule 2 of the Competition and
              Consumer Act 2010) or any other applicable law that cannot be excluded, restricted, or
              modified by agreement.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mt-8 mb-3">
              11. Indemnification
            </h2>
            <p>
              You agree to indemnify and hold harmless Spresso and its officers, directors, and
              employees from any claims, damages, or expenses arising from your use of the Platform,
              your content, or your violation of these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mt-8 mb-3">12. Termination</h2>
            <p>
              We may suspend or terminate your account at any time for violation of these Terms,
              with or without notice. Upon termination, your right to use the Platform ceases
              immediately. Provisions that by their nature should survive termination (including
              ownership, indemnification, and limitation of liability) will survive.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mt-8 mb-3">13. Governing Law</h2>
            <p>
              These Terms are governed by and construed in accordance with the laws of the State of
              Victoria, Australia. Any disputes arising under these Terms will be subject to the
              exclusive jurisdiction of the courts of Victoria.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mt-8 mb-3">
              14. Changes to These Terms
            </h2>
            <p>
              We may update these Terms from time to time. We will notify you of material changes by
              posting the updated Terms on our website. Continued use of the Platform after changes
              constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mt-8 mb-3">15. Contact Us</h2>
            <p>If you have questions about these Terms, contact us at:</p>
            <p>
              <strong>Email:</strong>{' '}
              <a href="mailto:support@spresso.xyz" className="text-accent hover:underline">
                support@spresso.xyz
              </a>
              <br />
              <strong>Website:</strong>{' '}
              <a href="https://spresso.xyz" className="text-accent hover:underline">
                spresso.xyz
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
