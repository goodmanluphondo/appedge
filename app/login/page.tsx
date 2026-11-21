import { Suspense } from "react";
import { Brand } from "../brand";
import { SignInForm } from "../sign-in-form";

type LoginPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: "You do not have access to AppEdge with this account. Contact your administrator if you think this is a mistake.",
  RateLimited: "Too many sign-in attempts. Wait a few minutes, then try again.",
};
const DEFAULT_ERROR_MESSAGE = "Your sign-in could not be completed. Try again.";

async function SignInBody({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;
  const errorCode = Array.isArray(error) ? error[0] : error;
  const message = errorCode ? ERROR_MESSAGES[errorCode] ?? DEFAULT_ERROR_MESSAGE : null;

  return <>
    {message && <p className="login-error" role="alert">{message}</p>}
    <SignInForm retry={message !== null}/>
  </>;
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  return <main className="login-page">
    <Brand size={40} className="login-brand"/>
    <section className="login-card" aria-labelledby="login-title">
      <div className="login-copy"><h1 id="login-title">Sign in</h1><p>Use your work Microsoft account to open the AppEdge console.</p></div>
      <Suspense fallback={<SignInForm retry={false}/>}><SignInBody searchParams={searchParams}/></Suspense>
    </section>
  </main>;
}
