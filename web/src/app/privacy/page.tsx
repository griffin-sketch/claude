import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL, LegalPage, Section } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy · Tourvo",
  description: "How Tourvo collects, uses and protects your information.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <p>
          {LEGAL.product} turns listing photos into videos and staged photos for real estate agents and photographers. It is run by{" "}
          {LEGAL.company}, a Texas limited liability company (&quot;we,&quot; &quot;us&quot;). This policy explains what information we collect
          when you use {LEGAL.site} (the &quot;Service&quot;), what we do with it, and the choices you have. We don&apos;t sell your
          information.
        </p>
      }
    >
      <Section title="1. Information we collect">
        <p><strong>Information you give us</strong></p>
        <ul>
          <li><strong>Account details:</strong> your email address. If you sign in with Google, we receive your name, email address and profile picture from Google. We never see your Google password.</li>
          <li><strong>Branding details:</strong> anything you add for your videos, such as your name, title, brokerage, company, phone number, email, headshot and logo, and the same details for a client you make a video for.</li>
          <li><strong>Listing content:</strong> photos you upload, room names, addresses, prices, home details, open house times, music you upload, and the choices you make (effects, camera moves, styles).</li>
          <li><strong>Messages:</strong> anything you send us by email.</li>
        </ul>
        <p><strong>Information created when you use the Service</strong></p>
        <ul>
          <li><strong>Generated content:</strong> the video clips, finished videos, staged photos and previews we create from your photos.</li>
          <li><strong>Payment records:</strong> what you bought, when, and your plan status. Payments are handled by Stripe. We never receive or store your full card number; Stripe shares only limited details with us, such as your card brand and last four digits.</li>
          <li><strong>Technical information:</strong> basic logs our hosting providers keep automatically, such as IP address, browser type, device type, pages requested and error reports, used to run, secure and fix the Service.</li>
        </ul>
      </Section>

      <Section title="2. How we use your information">
        <ul>
          <li>To create your account and sign you in.</li>
          <li>To make your videos and staged photos, including sending your photos and instructions to the AI providers listed below.</li>
          <li>To put your branding on your videos and to show your videos on share pages you create.</li>
          <li>To process payments, manage your plan and credits, and prevent fraud.</li>
          <li>To email you about your account and orders, for example when your video is ready.</li>
          <li>To answer your questions, fix problems, and improve the Service.</li>
          <li>To meet legal obligations and enforce our <Link href="/terms">Terms of Service</Link>.</li>
        </ul>
        <p>
          We do not use your photos, listings or videos to train our own AI models, and we do not sell or rent your personal information. We don&apos;t
          run third-party advertising or ad tracking on the Service.
        </p>
        <p>
          We may show work made with {LEGAL.product} in our own marketing only with your permission.
        </p>
      </Section>

      <Section title="3. Who we share it with">
        <p>We share information only with companies that help us run the Service, and only what they need to do their job:</p>
        <ul>
          <li><strong>Supabase:</strong> sign-in, database and file storage.</li>
          <li><strong>Vercel:</strong> hosting for the website.</li>
          <li><strong>Railway:</strong> hosting for the servers that build your videos.</li>
          <li><strong>fal.ai and the AI models it runs:</strong> receive your photos and instructions to generate video clips, staged photos and photo edits.</li>
          <li><strong>Stripe:</strong> payment processing. Stripe&apos;s use of your information is covered by its own privacy policy.</li>
          <li><strong>Google:</strong> if you choose &quot;Continue with Google&quot; to sign in.</li>
          <li><strong>Our email provider:</strong> to send sign-in codes and order emails.</li>
        </ul>
        <p>
          We may also share information if the law requires it, to protect the rights, safety or property of our users, the public or us, or as part of
          a merger, sale or transfer of our business, in which case this policy will continue to apply to your information.
        </p>
        <p>
          <strong>Share pages:</strong> when you create a share link for your videos, anyone who has that link can view and download those videos. Share
          pages are hidden from search engines, but treat the link as you would any link you send to others.
        </p>
      </Section>

      <Section title="4. Cookies">
        <p>
          We use only the cookies and browser storage needed to keep you signed in and remember things like which step you were on. We don&apos;t use
          advertising cookies. Stripe may set its own cookies on its checkout page to prevent fraud.
        </p>
      </Section>

      <Section title="5. How long we keep it">
        <p>
          We keep your account information, listings, photos and videos while your account is open so you can come back and download them. If you
          remove a photo, or ask us to delete a listing or your account, we delete that content from our active systems within 30 days, though copies may
          remain in backups for a short time after. We keep payment and tax records as long as the law requires.
        </p>
      </Section>

      <Section title="6. Security">
        <p>
          Your files are kept in private storage. Each account can see only its own listings, and finished files are shared through links that expire.
          Connections to the Service are encrypted. No system is perfectly secure, so we can&apos;t promise absolute security, but we work to protect your
          information and will notify you if the law requires it after a breach.
        </p>
      </Section>

      <Section title="7. Your choices and rights">
        <ul>
          <li>You can update your branding details at any time in Branding.</li>
          <li>You can remove photos you&apos;ve uploaded, and ask us to delete a listing.</li>
          <li>You can ask us for a copy of your information, to correct it, or to delete your account by emailing <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.</li>
          <li>You can cancel a monthly plan at any time in Billing.</li>
        </ul>
        <p>
          Depending on where you live, including Texas, California and other states with privacy laws, you may have additional rights, such as the
          right to know what we collect, to access, correct or delete it, and to appeal a decision we make about your request. We won&apos;t
          discriminate against you for using these rights. To use any of them, email us; we&apos;ll respond within the time the law requires and may
          need to confirm your identity first. If we deny a request, you may appeal by replying to our decision.
        </p>
      </Section>

      <Section title="8. Information about other people">
        <p>
          If you upload information about someone else, such as a client&apos;s name, phone number, headshot or logo, you&apos;re responsible for having
          their permission to do so. Listing photos should not include identifiable people, personal documents or other private details; please
          remove them before uploading.
        </p>
      </Section>

      <Section title="9. Children">
        <p>
          The Service is for real estate professionals and is not meant for anyone under 18. We don&apos;t knowingly collect information from children.
          If you believe a child has given us information, contact us and we&apos;ll delete it.
        </p>
      </Section>

      <Section title="10. Where your information is stored">
        <p>
          We are based in the United States, and our service providers store and process information in the United States and possibly other
          countries. By using the Service, you understand your information will be handled there.
        </p>
      </Section>

      <Section title="11. Google sign-in">
        <p>
          If you sign in with Google, we receive only your basic profile (name, email address and profile picture). We use it only to create and sign
          in to your account and to address you in the Service. We don&apos;t access your Gmail, Drive, contacts or any other Google data, and we
          don&apos;t share your Google information with anyone except the service providers listed above who help us run sign-in. Our use of
          information received from Google follows the Google API Services User Data Policy, including its Limited Use requirements.
        </p>
      </Section>

      <Section title="12. Changes to this policy">
        <p>
          If we change this policy, we&apos;ll update the date at the top. If the changes are significant, we&apos;ll let you know by email or in the
          Service before they take effect.
        </p>
      </Section>

      <Section title="13. Contact us">
        <p>
          {LEGAL.company}, Houston, Texas · <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
        </p>
      </Section>
    </LegalPage>
  );
}
