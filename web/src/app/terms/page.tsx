import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL, LegalPage, Section } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service · Tourvo",
  description: "The terms for using Tourvo listing videos and virtual staging.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={
        <p>
          These terms are an agreement between you and {LEGAL.company}, a Texas limited liability company (&quot;we,&quot; &quot;us&quot;), which
          runs {LEGAL.product} at {LEGAL.site} (the &quot;Service&quot;). By creating an account or using the Service, you agree to these terms and to
          our <Link href="/privacy" className="underline">Privacy Policy</Link>. If you&apos;re using the Service for a company or brokerage, you agree
          for them too and confirm you can do so.
        </p>
      }
    >
      <Section title="1. What Tourvo does">
        <p>
          {LEGAL.product} uses artificial intelligence to turn listing photos into video clips, finished listing videos and short social videos, and to
          create virtually staged photos. You upload photos and make choices; our systems and third-party AI models generate the results.
        </p>
      </Section>

      <Section title="2. Your account">
        <ul>
          <li>You must be at least 18 and able to enter a binding contract.</li>
          <li>Give us accurate information and keep access to your email and sign-in secure. You&apos;re responsible for what happens in your account.</li>
          <li>Tell us right away at <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> if you think someone has used your account without permission.</li>
        </ul>
      </Section>

      <Section title="3. Pricing and payment">
        <ul>
          <li><strong>Single listing video:</strong> a one-time payment per listing, as shown at checkout.</li>
          <li><strong>Monthly plan:</strong> a recurring monthly charge that includes a set number of listing videos (credits) each billing period. Credits reset at the start of each period and don&apos;t roll over. If you cancel, your plan stays active until the end of the period you&apos;ve paid for, then credits end.</li>
          <li><strong>Staged photos:</strong> previews are free and watermarked; you pay per photo to download the full-size version.</li>
        </ul>
        <p>
          Prices are shown on our website and at checkout, in U.S. dollars, and may change. A price change won&apos;t affect anything you&apos;ve
          already paid for, and we&apos;ll tell you before a new price applies to your monthly plan. Payments are processed by Stripe; by paying, you
          authorize us to charge your payment method, including automatically each month for a monthly plan until you cancel. You&apos;re responsible
          for any taxes that apply. You can cancel your monthly plan at any time in Billing.
        </p>
      </Section>

      <Section id="refunds" title="4. Redos and refunds">
        <p>
          AI results vary. Before your final videos are made, you can review each clip and ask for a new version of any clip you don&apos;t like. If
          something we deliver is broken, fails to generate, or is clearly not what the Service describes, email us within 14 days and we&apos;ll
          remake it or refund that purchase.
        </p>
        <p>
          Because each order uses paid computing as soon as it starts, purchases are otherwise non-refundable once your clips or staged photos have been
          generated, and monthly plan charges aren&apos;t refunded for partial months or unused credits. This doesn&apos;t limit any rights you have
          under the law.
        </p>
      </Section>

      <Section title="5. Your content">
        <p>
          &quot;Your content&quot; means the photos, logos, headshots, music, text and other material you upload. You keep ownership of it. You give
          us a limited, non-exclusive, worldwide license to store, copy, process, edit and transmit your content, including sending it to our AI and
          hosting providers, only as needed to run the Service for you and to show your videos on share pages you create. This license ends when your
          content is deleted from the Service, except for copies in backups and anything you&apos;ve already shared.
        </p>
        <p>You promise that:</p>
        <ul>
          <li>You own your content or have permission to use it this way, including from the photographer who took the photos and the people who own any logos, headshots or music you upload.</li>
          <li>Your content doesn&apos;t break any law or anyone else&apos;s rights, including privacy, copyright and trademark rights.</li>
          <li>You have permission from the seller, listing agent or property owner to market the property.</li>
        </ul>
      </Section>

      <Section title="6. What we make for you">
        <p>
          As between you and us, you own the videos and staged photos the Service makes for you (&quot;outputs&quot;) once you&apos;ve paid for them,
          and you may use them for any lawful purpose, including marketing listings and posting them on social media, MLS sites and websites. Outputs
          you haven&apos;t paid for, such as watermarked previews, are for review only. The same or similar results may be produced for other users,
          and we don&apos;t guarantee that outputs can be protected by copyright.
        </p>
        <p>
          Our templates, effects, music library, fonts, design, software and the {LEGAL.product} name and logo belong to us or our licensors.
          Music we provide is licensed for use inside the videos you make with the Service; you may not extract it or use it separately.
        </p>
      </Section>

      <Section title="7. AI content and real estate rules">
        <p>
          AI can make mistakes. Effects such as virtual staging, day-to-dusk, construction build-up, added appliances or improved lighting change how a
          property looks, and camera moves can show details that weren&apos;t in the original photo. <strong>You are responsible for reviewing every
          output before you use it and for making sure your marketing is accurate.</strong>
        </p>
        <ul>
          <li>Label virtually staged or digitally altered images and videos as required by your MLS, brokerage, state real estate commission and advertising laws (for example, &quot;Virtually staged&quot;).</li>
          <li>Don&apos;t use outputs to hide defects, misstate a property&apos;s condition, size or features, or otherwise mislead buyers or renters.</li>
          <li>Follow fair housing laws in all marketing you create with the Service.</li>
        </ul>
      </Section>

      <Section title="8. Things you can't do">
        <ul>
          <li>Upload content you don&apos;t have the rights to, or content that is illegal, sexual, violent, hateful or harassing.</li>
          <li>Upload images of people without their permission, or images of minors.</li>
          <li>Use the Service to create misleading or fraudulent listings or to impersonate anyone.</li>
          <li>Try to get around payment, watermarks, credits or usage limits.</li>
          <li>Access the Service with bots or scrapers, overload it, probe it for security weaknesses, or copy, reverse engineer or resell it.</li>
          <li>Share your account with people outside your business.</li>
        </ul>
        <p>We may remove content or suspend accounts that break these rules.</p>
      </Section>

      <Section title="9. Third-party services">
        <p>
          The Service relies on outside providers, including Stripe for payments, Google for sign-in, and AI model providers for generation. Their own
          terms may apply to your use of their features, and we&apos;re not responsible for their services.
        </p>
      </Section>

      <Section title="10. Changes and availability">
        <p>
          We&apos;re always improving the Service and may add, change or remove features. We may update these terms; we&apos;ll change the date at the
          top and tell you by email or in the Service about significant changes. Continuing to use the Service after changes take effect means you
          accept them. We aim to keep the Service running but don&apos;t promise it will always be available, error-free, or that files will be kept
          forever, so download anything you want to keep.
        </p>
      </Section>

      <Section title="11. Ending your account">
        <p>
          You can stop using the Service and ask us to delete your account at any time. We may suspend or close your account if you break these terms,
          don&apos;t pay, or if we&apos;re required to by law. If we close the Service entirely, we&apos;ll give you reasonable notice to download your
          files and will refund any prepaid, unused monthly plan time. Sections 5 through 15 continue to apply after your account ends.
        </p>
      </Section>

      <Section title="12. Disclaimers">
        <p>
          THE SERVICE AND ALL OUTPUTS ARE PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE.&quot; TO THE FULLEST EXTENT THE LAW ALLOWS, WE DISCLAIM
          ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT AND ACCURACY. WE DON&apos;T
          PROMISE THAT OUTPUTS WILL BE ACCURATE, MEET YOUR EXPECTATIONS OR COMPLY WITH YOUR MLS OR BROKERAGE RULES, OR THAT USING THE SERVICE WILL HELP
          YOU SELL OR RENT A PROPERTY.
        </p>
      </Section>

      <Section title="13. Limit of liability">
        <p>
          TO THE FULLEST EXTENT THE LAW ALLOWS, WE WON&apos;T BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL OR PUNITIVE DAMAGES, OR FOR
          LOST PROFITS, COMMISSIONS, SALES, DATA OR GOODWILL, ARISING FROM YOUR USE OF THE SERVICE OR ANY OUTPUT. OUR TOTAL LIABILITY FOR ANY CLAIM
          RELATED TO THE SERVICE IS LIMITED TO THE GREATER OF THE AMOUNT YOU PAID US IN THE 12 MONTHS BEFORE THE CLAIM OR $100. Some places don&apos;t
          allow these limits, so they may not fully apply to you.
        </p>
      </Section>

      <Section title="14. Your responsibility to us">
        <p>
          You agree to defend and pay for any claims, losses and costs (including reasonable attorneys&apos; fees) brought against us by others because
          of your content, your use of outputs in your marketing, or your breaking these terms or the law.
        </p>
      </Section>

      <Section title="15. Disputes">
        <p>
          These terms are governed by the laws of the State of Texas, without regard to its conflict-of-law rules. Before filing a claim, please email
          us so we can try to resolve it informally within 30 days. Any lawsuit must be brought in the state or federal courts located in Harris
          County, Texas, and you and we agree to those courts&apos; jurisdiction. Either of us may bring a qualifying claim in small claims court
          instead.
        </p>
      </Section>

      <Section title="16. Other terms">
        <p>
          These terms and our Privacy Policy are the whole agreement between you and us about the Service. If any part is found unenforceable, the rest
          stays in effect. If we don&apos;t enforce a term right away, we haven&apos;t waived it. You can&apos;t transfer these terms without our
          permission; we may transfer them as part of a merger, sale or reorganization. Notices to you may be sent to your account email.
        </p>
      </Section>

      <Section title="17. Contact">
        <p>
          {LEGAL.company}, Houston, Texas · <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
        </p>
      </Section>
    </LegalPage>
  );
}
