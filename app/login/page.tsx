import { Suspense } from "react";

type LoginPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

async function LoginErrorMessage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;
  const errorCode = Array.isArray(error) ? error[0] : error;
  const errorMessage = errorCode === "AccessDenied"
    ? "This Microsoft account is not assigned the AppEdge Administrator role."
    : errorCode === "RateLimited"
      ? "Too many sign-in attempts. Please wait a few minutes and try again."
      : errorCode
        ? "Microsoft sign-in could not be completed. Please try again."
        : null;

  return errorMessage ? <p className="login-error" role="alert">{errorMessage}</p> : null;
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  return <main className="login-page"><section className="login-card" aria-labelledby="login-title"><div className="login-brand"><span className="brand-mark"><span/><span/><span/></span><span className="brand-name">App<span>Edge</span></span></div><div className="login-copy"><span className="login-eyebrow">ADMINISTRATOR ACCESS</span><h1 id="login-title">Sign in to AppEdge</h1><p>Use your Microsoft work account to continue.</p></div><Suspense fallback={null}><LoginErrorMessage searchParams={searchParams}/></Suspense><form action="/auth/sign-in" method="post"><button className="button button-primary microsoft-sign-in" type="submit"><span className="microsoft-mark" aria-hidden="true"><i/><i/><i/><i/></span>Continue with Microsoft</button></form></section></main>;
}
