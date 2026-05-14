import { useEffect } from "react";
import { useLocation } from "wouter";

// Password reset is now owned by Clerk's hosted flow.
export default function ResetPasswordPage() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/sign-in");
  }, [setLocation]);
  return null;
}
