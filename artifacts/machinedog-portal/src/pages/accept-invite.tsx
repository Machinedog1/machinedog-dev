import { useEffect } from "react";
import { useLocation } from "wouter";

// Invitation acceptance is owned by Clerk: invitees click the link in the
// email Clerk sends and complete sign-up via Clerk's hosted flow. Once
// signed in, the api-server's `activatePendingMemberships` hook links them
// to the right organization on first request.
export default function AcceptInvitePage() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/sign-in");
  }, [setLocation]);
  return null;
}
