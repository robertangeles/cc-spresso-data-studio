import { Link } from 'react-router-dom';

export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-surface-0">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link to="/" className="text-sm text-accent hover:underline mb-8 inline-block">
          &larr; Back to Spresso
        </Link>

        <h1 className="text-3xl font-bold text-text-primary mb-2">Privacy Policy</h1>
        <p className="text-sm text-text-tertiary mb-10">Last updated: 12 April 2026</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-text-secondary">
          <section>
            <h2 className="text-lg font-semibold text-text-primary mt-8 mb-3">
              1. About This Policy
            </h2>
            <p>
              Spresso (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) is an Australian
              company operating the content operations platform at spresso.xyz. We are committed to
              protecting your personal information in accordance with the Privacy Act 1988 (Cth) and
              the Australian Privacy Principles (APPs).
            </p>
            <p>
              This policy explains how we collect, use, disclose, and store your personal
              information when you use our platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mt-8 mb-3">
              2. Information We Collect
            </h2>
            <p>We collect the following types of personal information:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                <strong>Account information:</strong> name, email address, and password when you
                register.
              </li>
              <li>
                <strong>Profile information:</strong> avatar, brand kit details, and writing rules
                you configure.
              </li>
              <li>
                <strong>Payment information:</strong> processed securely by Stripe. We do not store
                your credit card details.
              </li>
              <li>
                <strong>Content:</strong> text, images, and other content you create, generate, or
                upload through the platform.
              </li>
              <li>
                <strong>Social media accounts:</strong> OAuth tokens and account identifiers when
                you connect platforms (e.g., Pinterest, LinkedIn, X, Facebook, Instagram, Bluesky).
              </li>
              <li>
                <strong>Usage data:</strong> AI model usage, token counts, feature interactions, and
                session information.
              </li>
              <li>
                <strong>Technical data:</strong> IP address, browser type, and device information
                collected automatically.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mt-8 mb-3">
              3. How We Use Your Information
            </h2>
            <p>We use your personal information to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Provide, maintain, and improve the Spresso platform.</li>
              <li>Process your subscription payments and manage your account.</li>
              <li>
                Generate and publish content on your behalf to connected social media platforms.
              </li>
              <li>Send AI-generated content through third-party AI providers on your behalf.</li>
              <li>Track usage for billing, credit allocation, and service optimisation.</li>
              <li>Send transactional emails (account verification, billing notifications).</li>
              <li>Respond to your enquiries and provide customer support.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mt-8 mb-3">
              4. Third-Party Services
            </h2>
            <p>
              We share your information with the following categories of third-party service
              providers:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                <strong>AI providers (OpenRouter):</strong> your content prompts are sent to AI
                models for generation. OpenRouter routes requests to providers such as Anthropic,
                OpenAI, Google, Mistral, and others. Content is processed according to each
                provider&apos;s data handling policies.
              </li>
              <li>
                <strong>Payment processing (Stripe):</strong> payment and subscription data is
                processed by Stripe Inc.
              </li>
              <li>
                <strong>Email delivery (Resend):</strong> transactional emails are sent via Resend.
              </li>
              <li>
                <strong>Social media platforms:</strong> content is published to platforms you have
                connected and authorised (Pinterest, LinkedIn, X, Facebook, Instagram, Threads,
                Bluesky).
              </li>
              <li>
                <strong>Hosting (Render):</strong> our application and database are hosted on
                Render&apos;s infrastructure.
              </li>
              <li>
                <strong>Media storage (Cloudinary):</strong> uploaded images are stored and served
                via Cloudinary.
              </li>
            </ul>
            <p>We do not sell your personal information to any third party.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mt-8 mb-3">
              5. Data Storage and Security
            </h2>
            <p>
              Your data is stored on servers located in the United States (Render and Cloudinary
              infrastructure). By using Spresso, you consent to the transfer of your data to these
              overseas facilities. We take reasonable steps to ensure that overseas recipients
              handle your data in accordance with the APPs.
            </p>
            <p>
              We implement industry-standard security measures including encrypted connections
              (HTTPS/TLS), hashed passwords (bcrypt), HTTP-only secure cookies, and role-based
              access controls.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mt-8 mb-3">6. Cookies</h2>
            <p>
              We use essential cookies for authentication (refresh tokens stored as HTTP-only secure
              cookies). We do not use third-party tracking cookies or advertising cookies. No cookie
              consent banner is required as we only use strictly necessary cookies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mt-8 mb-3">7. Your Rights</h2>
            <p>Under the Australian Privacy Principles, you have the right to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Access the personal information we hold about you.</li>
              <li>Request correction of inaccurate or incomplete information.</li>
              <li>Request deletion of your account and associated data.</li>
              <li>Withdraw consent for specific data processing activities.</li>
              <li>
                Lodge a complaint with the Office of the Australian Information Commissioner (OAIC)
                if you believe we have breached the APPs.
              </li>
            </ul>
            <p>
              To exercise any of these rights, contact us at{' '}
              <a href="mailto:privacy@spresso.xyz" className="text-accent hover:underline">
                privacy@spresso.xyz
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mt-8 mb-3">8. Data Retention</h2>
            <p>
              We retain your personal information for as long as your account is active or as needed
              to provide you with our services. When you delete your account, we delete your
              personal data within 30 days, except where we are required by law to retain it.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mt-8 mb-3">
              9. Children&apos;s Privacy
            </h2>
            <p>
              Spresso is not intended for use by individuals under the age of 18. We do not
              knowingly collect personal information from children.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mt-8 mb-3">
              10. Changes to This Policy
            </h2>
            <p>
              We may update this privacy policy from time to time. We will notify you of material
              changes by posting the updated policy on our website and updating the &ldquo;Last
              updated&rdquo; date above.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mt-8 mb-3">11. Contact Us</h2>
            <p>
              If you have questions about this privacy policy or our data practices, contact us at:
            </p>
            <p>
              <strong>Email:</strong>{' '}
              <a href="mailto:privacy@spresso.xyz" className="text-accent hover:underline">
                privacy@spresso.xyz
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
