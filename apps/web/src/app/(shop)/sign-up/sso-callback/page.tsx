import { SignUpSsoCallback } from "@/components/auth";

interface SsoCallbackPageProps {
  searchParams: Promise<{ redirect_url?: string | string[] }>;
}

export default async function SsoCallbackPage({ searchParams }: SsoCallbackPageProps) {
  const { redirect_url: redirectUrl } = await searchParams;

  return (
    <div className="page-container flex justify-center py-12">
      <SignUpSsoCallback redirectUrl={typeof redirectUrl === "string" ? redirectUrl : undefined} />
    </div>
  );
}
