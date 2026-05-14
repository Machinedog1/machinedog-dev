import { useEffect } from "react";
import { useLocation } from "wouter";

// Password recovery is now owned by Clerk's hosted flow inside the
// `<SignIn />` component on /sign-in.
export default function ForgotPasswordPage() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/sign-in");
  }, [setLocation]);
  return null;
}
