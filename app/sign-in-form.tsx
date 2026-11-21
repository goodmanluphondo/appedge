"use client";

import { useState } from "react";

export function SignInForm({ retry }: { retry: boolean }) {
  const [signingIn, setSigningIn] = useState(false);
  const label = signingIn ? "Signing in…" : retry ? "Try again with Microsoft" : "Sign in with Microsoft";

  return <form action="/auth/sign-in" method="post" onSubmit={() => setSigningIn(true)}>
    <button className="microsoft-sign-in" type="submit" disabled={signingIn}>
      {signingIn
        ? <span className="spinner is-dark" aria-hidden="true"/>
        : <span className="microsoft-mark" aria-hidden="true"><i/><i/><i/><i/></span>}
      {label}
    </button>
  </form>;
}
