/**
 * Shared "Apple glass" / liquid-glass appearance preset for the Clerk
 * <SignIn /> and <SignUp /> widgets. Gives the auth card a frosted
 * backdrop-blur surface with subtle inner highlight, soft outer shadow,
 * and translucent inputs/buttons that feel native to the dark hero.
 *
 * The pages set a vivid gradient backdrop behind the widget so the
 * blur actually reads — a glass card on a flat color looks like a flat
 * card, so the gradient is doing real work here.
 */

import type { Appearance } from "@clerk/types";

const glass = {
  background: "rgba(255, 255, 255, 0.08)",
  border: "1px solid rgba(255, 255, 255, 0.18)",
  backdropFilter: "blur(28px) saturate(180%)",
  WebkitBackdropFilter: "blur(28px) saturate(180%)",
};

export const glassClerkAppearance: Appearance = {
  variables: {
    colorPrimary: "hsl(200 95% 60%)",
    colorBackground: "transparent",
    colorText: "rgba(255, 255, 255, 0.96)",
    colorTextSecondary: "rgba(255, 255, 255, 0.64)",
    colorInputBackground: "rgba(255, 255, 255, 0.06)",
    colorInputText: "rgba(255, 255, 255, 0.96)",
    colorNeutral: "white",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
    borderRadius: "16px",
    spacingUnit: "1rem",
  },
  elements: {
    rootBox: {
      width: "100%",
      maxWidth: "440px",
    },
    card: {
      ...glass,
      borderRadius: "28px",
      boxShadow:
        "0 30px 80px -20px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.18)",
      padding: "2rem",
      color: "rgba(255, 255, 255, 0.96)",
    },
    headerTitle: {
      color: "white",
      fontWeight: 700,
      letterSpacing: "-0.01em",
      fontSize: "1.5rem",
    },
    headerSubtitle: {
      color: "rgba(255, 255, 255, 0.64)",
    },
    socialButtonsBlockButton: {
      ...glass,
      color: "rgba(255, 255, 255, 0.96)",
      transition: "background 200ms ease, transform 200ms ease",
      "&:hover": {
        background: "rgba(255, 255, 255, 0.14)",
      },
    },
    socialButtonsBlockButtonText: {
      color: "rgba(255, 255, 255, 0.96)",
      fontWeight: 600,
    },
    dividerLine: {
      background: "rgba(255, 255, 255, 0.14)",
    },
    dividerText: {
      color: "rgba(255, 255, 255, 0.5)",
      textTransform: "uppercase",
      letterSpacing: "0.18em",
      fontSize: "10px",
    },
    formFieldLabel: {
      color: "rgba(255, 255, 255, 0.78)",
      fontWeight: 500,
      fontSize: "0.8125rem",
    },
    formFieldInput: {
      ...glass,
      color: "white",
      borderRadius: "14px",
      padding: "0.75rem 1rem",
      transition: "border-color 200ms ease, background 200ms ease",
      "&:focus": {
        borderColor: "rgba(255, 255, 255, 0.4)",
        background: "rgba(255, 255, 255, 0.12)",
        boxShadow: "0 0 0 4px rgba(120, 200, 255, 0.18)",
      },
      "&::placeholder": {
        color: "rgba(255, 255, 255, 0.36)",
      },
    },
    formFieldInputShowPasswordButton: {
      color: "rgba(255, 255, 255, 0.6)",
    },
    formButtonPrimary: {
      background:
        "linear-gradient(135deg, hsl(200 95% 60%) 0%, hsl(254 90% 68%) 100%)",
      color: "white",
      fontWeight: 600,
      borderRadius: "14px",
      padding: "0.75rem 1rem",
      boxShadow:
        "0 10px 30px -10px rgba(80, 150, 255, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.3)",
      transition: "transform 150ms ease, box-shadow 200ms ease",
      "&:hover": {
        transform: "translateY(-1px)",
        boxShadow:
          "0 14px 40px -10px rgba(80, 150, 255, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.35)",
      },
    },
    footerActionText: {
      color: "rgba(255, 255, 255, 0.6)",
    },
    footerActionLink: {
      color: "white",
      fontWeight: 600,
      "&:hover": { color: "hsl(200 100% 78%)" },
    },
    footer: {
      background: "transparent",
    },
    footerPagesLink: {
      color: "rgba(255, 255, 255, 0.5)",
    },
    identityPreview: {
      ...glass,
      borderRadius: "14px",
    },
    identityPreviewText: {
      color: "rgba(255, 255, 255, 0.9)",
    },
    identityPreviewEditButton: {
      color: "hsl(200 100% 75%)",
    },
    formFieldAction: {
      color: "hsl(200 100% 75%)",
    },
    alert: {
      ...glass,
      borderRadius: "14px",
    },
    alertText: {
      color: "rgba(255, 255, 255, 0.92)",
    },
    formFieldErrorText: {
      color: "hsl(0 90% 75%)",
    },
    otpCodeFieldInput: {
      ...glass,
      color: "white",
      borderRadius: "12px",
    },
  },
};
